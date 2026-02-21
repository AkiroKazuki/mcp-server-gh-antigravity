#!/usr/bin/env node

/**
 * Antigravity OS v2.0 - Copilot Server
 * 11 tools + 2 prompts: 6 enhanced from v1 + 5 new tools + 1 new prompt.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs/promises";
import path from "node:path";
import { Validator } from "./validator.js";
import { CacheManager } from "./cache-manager.js";
import { ContextGatherer } from "./context-gatherer.js";
import { FailureAnalyzer } from "./failure-analyzer.js";
import { LoopDetector } from "./loop-detector.js";
import { getEfficiencyRulesPrompt, Logger, InputValidator } from "@antigravity-os/shared";

const log = new Logger("copilot-server");

// --- Configuration ---

const PROJECT_ROOT = process.env.PROJECT_ROOT || process.cwd();
const MEMORY_DIR = process.env.MEMORY_DIR || ".memory";
const MEMORY_PATH = path.join(PROJECT_ROOT, MEMORY_DIR);
const DB_PATH = path.join(MEMORY_PATH, "antigravity.db");
const SKILLS_DIR = path.join(MEMORY_PATH, "prompts", "templates");
const GENERATED_DIR = path.join(MEMORY_PATH, "prompts", "generated");

// --- Helpers ---

function respond(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function respondError(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

// --- Server ---

class CopilotServer {
  private server: Server;
  private validator: Validator;
  private cache: CacheManager;
  private contextGatherer: ContextGatherer;
  private failureAnalyzer: FailureAnalyzer;
  private loopDetector: LoopDetector;

  constructor() {
    this.server = new Server(
      { name: "antigravity-copilot", version: "2.0.0" },
      { capabilities: { tools: {}, prompts: {} } }
    );
    this.validator = new Validator();
    this.cache = new CacheManager(DB_PATH);
    this.contextGatherer = new ContextGatherer(PROJECT_ROOT);
    this.failureAnalyzer = new FailureAnalyzer();
    this.loopDetector = new LoopDetector();

    this.setupHandlers();

    this.server.onerror = (error) => {
      log.error("Server error", { error: String(error) });
    };
  }

  private setupHandlers() {
    // --- Tool listing ---
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "copilot_generate_prompt",
          description: "Build a structured AI prompt from a skill template with multi-file context injection.",
          inputSchema: {
            type: "object" as const,
            properties: {
              skill_file: { type: "string", description: "Skill template file (relative to .memory/prompts/templates/)" },
              requirements: { type: "string", description: "What you need from Copilot" },
              target_file: { type: "string", description: "File to generate code for" },
              context_files: { type: "array", items: { type: "string" }, description: "Additional files to include as context" },
              max_context_depth: { type: "number", description: "Import resolution depth (default: 1)" },
            },
            required: ["skill_file", "requirements"],
          },
        },
        {
          name: "copilot_execute",
          description: "Save generated code to file with response caching and validation.",
          inputSchema: {
            type: "object" as const,
            properties: {
              prompt_file: { type: "string", description: "Generated prompt file to execute" },
              output_file: { type: "string", description: "Where to save the result" },
              task_id: { type: "string", description: "Unique task ID for loop detection" },
              use_cache: { type: "boolean", description: "Use response cache (default: true)" },
            },
            required: ["prompt_file", "output_file"],
          },
        },
        {
          name: "copilot_validate",
          description: "Validate generated code for security, quality, and trading patterns.",
          inputSchema: {
            type: "object" as const,
            properties: {
              file: { type: "string", description: "File to validate" },
              requirements: { type: "array", items: { type: "string" }, description: "Specific requirements to check" },
            },
            required: ["file"],
          },
        },
        {
          name: "copilot_score",
          description: "Score a Copilot output for relevance, correctness, and quality.",
          inputSchema: {
            type: "object" as const,
            properties: {
              file: { type: "string", description: "Generated file to score" },
              prompt_file: { type: "string", description: "Original prompt file" },
              skill_file: { type: "string", description: "Skill file used (for effectiveness tracking)" },
            },
            required: ["file"],
          },
        },
        {
          name: "copilot_batch_execute",
          description: "Execute multiple prompts with conflict detection.",
          inputSchema: {
            type: "object" as const,
            properties: {
              prompts: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    prompt_file: { type: "string" },
                    output_file: { type: "string" },
                    task_id: { type: "string" },
                  },
                  required: ["prompt_file", "output_file"],
                },
                description: "Array of prompt/output pairs",
              },
            },
            required: ["prompts"],
          },
        },
        {
          name: "copilot_preview",
          description: "Preview what a prompt would generate without saving. Shows enhanced diff.",
          inputSchema: {
            type: "object" as const,
            properties: {
              prompt_file: { type: "string", description: "Generated prompt file" },
              target_file: { type: "string", description: "Existing file to diff against" },
            },
            required: ["prompt_file"],
          },
        },
        // --- New v2 tools ---
        {
          name: "copilot_get_context",
          description: "Gather multi-file context for a target file (imports, types, signatures, git changes).",
          inputSchema: {
            type: "object" as const,
            properties: {
              target_file: { type: "string", description: "File to gather context for" },
              max_depth: { type: "number", description: "Import resolution depth (default: 1)" },
              include_types: { type: "boolean", description: "Include type definitions (default: true)" },
              include_git_diff: { type: "boolean", description: "Include recent git changes (default: true)" },
            },
            required: ["target_file"],
          },
        },
        {
          name: "copilot_cache_clear",
          description: "Clear the response cache.",
          inputSchema: {
            type: "object" as const,
            properties: {
              scope: { type: "string", enum: ["all", "expired", "today"], description: "Scope of cache to clear" },
            },
          },
        },
        {
          name: "copilot_cache_stats",
          description: "Get cache hit/miss statistics.",
          inputSchema: { type: "object" as const, properties: {} },
        },
        {
          name: "analyze_failure",
          description: "Analyze why a Copilot prompt failed (read-only diagnosis).",
          inputSchema: {
            type: "object" as const,
            properties: {
              prompt_file: { type: "string", description: "Prompt file that produced bad output" },
              output_file: { type: "string", description: "The bad output file" },
              validation_errors: { type: "array", items: { type: "string" }, description: "Validation errors if any" },
              expected: { type: "string", description: "What was expected" },
            },
            required: ["prompt_file"],
          },
        },
        {
          name: "suggest_skill_update",
          description: "Propose changes to a skill file based on failure analysis (requires approval).",
          inputSchema: {
            type: "object" as const,
            properties: {
              prompt_file: { type: "string", description: "Failed prompt file" },
              skill_file: { type: "string", description: "Skill file to update" },
              output_file: { type: "string", description: "Failed output file" },
              validation_errors: { type: "array", items: { type: "string" }, description: "Validation errors" },
            },
            required: ["prompt_file", "skill_file"],
          },
        },
      ],
    }));

    // --- Prompt listing ---
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => ({
      prompts: [
        {
          name: "efficiency_rules",
          description: "Core Antigravity OS efficiency rules for reducing token waste.",
        },
        {
          name: "quality_standards",
          description: "Code quality standards and validation requirements.",
        },
      ],
    }));

    // --- Prompt handler ---
    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name } = request.params;

      switch (name) {
        case "efficiency_rules":
          return getEfficiencyRulesPrompt();

        case "quality_standards":
          return {
            description: "Code quality validation standards",
            messages: [{
              role: "user" as const,
              content: {
                type: "text" as const,
                text: [
                  "# Antigravity OS Quality Standards",
                  "",
                  "## Security Requirements",
                  "- No eval(), exec(), or dynamic code execution",
                  "- No hardcoded credentials or API keys",
                  "- Use parameterized queries for all database operations",
                  "- Validate and sanitize all external input",
                  "- No curl | bash patterns",
                  "",
                  "## Code Quality",
                  "- All public functions must have explicit type annotations",
                  "- No empty catch blocks — always handle or re-throw",
                  "- No `any` type unless explicitly justified",
                  "- Use named constants instead of magic numbers",
                  "",
                  "## Trading-Specific",
                  "- All positions must reference stop-loss logic",
                  "- No leverage above 10x without explicit risk disclosure",
                  "- No forward-looking data access (prevent lookahead bias)",
                  "- All trading operations must include risk management",
                  "",
                  "## Validation Process",
                  "1. Run copilot_validate on all generated code",
                  "2. Review all 'critical' issues before accepting",
                  "3. Fix all security issues before merging",
                  "4. Score code with copilot_score to track quality trends",
                ].join("\n"),
              },
            }],
          };

        default:
          throw new Error(`Unknown prompt: ${name}`);
      }
    });

    // --- Tool handler ---
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      try {
        switch (name) {
          case "copilot_generate_prompt": return await this.handleGeneratePrompt(args);
          case "copilot_execute": return await this.handleExecute(args);
          case "copilot_validate": return await this.handleValidate(args);
          case "copilot_score": return await this.handleScore(args);
          case "copilot_batch_execute": return await this.handleBatchExecute(args);
          case "copilot_preview": return await this.handlePreview(args);
          case "copilot_get_context": return await this.handleGetContext(args);
          case "copilot_cache_clear": return await this.handleCacheClear(args);
          case "copilot_cache_stats": return await this.handleCacheStats();
          case "analyze_failure": return await this.handleAnalyzeFailure(args);
          case "suggest_skill_update": return await this.handleSuggestSkillUpdate(args);
          default:
            return respondError(`Unknown tool: ${name}`);
        }
      } catch (error: any) {
        return respondError(`Error: ${error.message}`);
      }
    });
  }

  // =========================================================================
  // Enhanced v1 handlers
  // =========================================================================

  private async handleGeneratePrompt(args: any) {
    new InputValidator("copilot_generate_prompt", args)
      .requireString("skill_file")
      .requireString("requirements")
      .optionalString("target_file")
      .optionalArray("context_files")
      .optionalNumber("max_context_depth")
      .validate();

    const skillFile: string = args.skill_file;
    const requirements: string = args.requirements;
    const targetFile: string | undefined = args.target_file;
    const contextFiles: string[] = args.context_files || [];
    const maxContextDepth: number = args.max_context_depth ?? 1;

    // Load skill template
    const skillPath = path.join(SKILLS_DIR, skillFile);
    let skillContent: string;
    try {
      skillContent = await fs.readFile(skillPath, "utf-8");
    } catch {
      return respondError(`Skill file not found: ${skillFile}. Create it in ${SKILLS_DIR}/`);
    }

    // Build context section
    let context = "";
    if (targetFile) {
      try {
        context = await this.contextGatherer.gatherContext(targetFile, {
          maxDepth: maxContextDepth,
          includeTypes: true,
          includeGitDiff: true,
        });
      } catch (err: any) {
        context = `[Context gathering failed: ${err.message}]`;
      }
    }

    // Add explicit context files
    for (const cf of contextFiles) {
      const cfPath = path.isAbsolute(cf) ? cf : path.join(PROJECT_ROOT, cf);
      try {
        const cfContent = await fs.readFile(cfPath, "utf-8");
        context += `\n\n## Additional Context: ${path.basename(cf)}\n\`\`\`\n${cfContent.slice(0, 3000)}\n\`\`\`\n`;
      } catch { /* skip missing */ }
    }

    // Assemble prompt
    const timestamp = new Date().toISOString();
    const prompt = [
      `# Generated Prompt — ${timestamp}`,
      `## Skill: ${skillFile}`,
      "",
      skillContent,
      "",
      "## Requirements",
      requirements,
      "",
      targetFile ? `## Target File: ${targetFile}` : "",
      context ? `## Context\n${context}` : "",
    ].filter(Boolean).join("\n");

    // Save generated prompt
    await fs.mkdir(GENERATED_DIR, { recursive: true });
    const promptFileName = `prompt_${Date.now()}.md`;
    const promptPath = path.join(GENERATED_DIR, promptFileName);
    await fs.writeFile(promptPath, prompt, "utf-8");

    return respond({
      status: "success",
      operation: "copilot_generate_prompt",
      summary: `Generated prompt from ${skillFile} (${prompt.length} chars)`,
      metadata: {
        prompt_file: path.relative(MEMORY_PATH, promptPath),
        skill_file: skillFile,
        prompt_length: prompt.length,
        has_context: context.length > 0,
        context_files: contextFiles.length,
        target_file: targetFile || null,
      },
    });
  }

  private async handleExecute(args: any) {
    new InputValidator("copilot_execute", args)
      .requireString("prompt_file")
      .requireString("output_file")
      .optionalString("task_id")
      .validate();

    const promptFile: string = args.prompt_file;
    const outputFile: string = args.output_file;
    const taskId: string = args.task_id || `task_${Date.now()}`;
    const useCache: boolean = args.use_cache ?? true;

    // Loop detection
    this.loopDetector.checkLoop(taskId);

    // Read prompt
    const promptPath = path.isAbsolute(promptFile) ? promptFile : path.join(MEMORY_PATH, promptFile);
    let promptContent: string;
    try {
      promptContent = await fs.readFile(promptPath, "utf-8");
    } catch {
      return respondError(`Prompt file not found: ${promptFile}`);
    }

    // Check cache
    if (useCache) {
      const cacheKey = this.cache.generateKey(promptContent, "");
      const cached = this.cache.get(cacheKey);
      if (cached) {
        const outPath = path.isAbsolute(outputFile) ? outputFile : path.join(PROJECT_ROOT, outputFile);
        await fs.mkdir(path.dirname(outPath), { recursive: true });
        await fs.writeFile(outPath, cached.response, "utf-8");

        return respond({
          status: "success",
          operation: "copilot_execute",
          summary: `Wrote cached result to ${outputFile}`,
          metadata: { output_file: outputFile, source: "cache", cache_key: cacheKey, hit_count: cached.hit_count },
        });
      }
    }

    // Save the prompt as output for the user/AI to process
    const outPath = path.isAbsolute(outputFile) ? outputFile : path.join(PROJECT_ROOT, outputFile);
    await fs.mkdir(path.dirname(outPath), { recursive: true });

    const outputContent = [
      `// Generated by Antigravity OS Copilot v2.0`,
      `// Prompt: ${promptFile}`,
      `// Task: ${taskId}`,
      `// Timestamp: ${new Date().toISOString()}`,
      `//`,
      `// TODO: Process the prompt below and replace this file with generated code.`,
      `//`,
      `// --- PROMPT START ---`,
      ...promptContent.split("\n").map((l) => `// ${l}`),
      `// --- PROMPT END ---`,
      "",
    ].join("\n");

    await fs.writeFile(outPath, outputContent, "utf-8");

    // Cache the result
    if (useCache) {
      const cacheKey = this.cache.generateKey(promptContent, "");
      this.cache.set(cacheKey, outputContent, { task_id: taskId, prompt_file: promptFile });
    }

    this.loopDetector.reset(taskId);

    return respond({
      status: "success",
      operation: "copilot_execute",
      summary: `Prompt saved to ${outputFile} for processing`,
      metadata: {
        output_file: outputFile,
        prompt_file: promptFile,
        task_id: taskId,
        source: "generated",
        output_length: outputContent.length,
      },
    });
  }

  private async handleValidate(args: any) {
    new InputValidator("copilot_validate", args)
      .requireString("file")
      .optionalArray("requirements")
      .validate();

    const file: string = args.file;
    const requirements: string[] | undefined = args.requirements;

    const filePath = path.isAbsolute(file) ? file : path.join(PROJECT_ROOT, file);
    let content: string;
    try {
      content = await fs.readFile(filePath, "utf-8");
    } catch {
      return respondError(`File not found: ${file}`);
    }

    const result = this.validator.validate(content, requirements);

    return respond({
      status: "success",
      operation: "copilot_validate",
      summary: result.valid
        ? `Validation passed (security: ${result.security_score}/100, quality: ${result.quality_score}/100)`
        : `Validation FAILED — ${result.issues.filter((i) => i.severity === "critical").length} critical issues`,
      metadata: {
        file,
        valid: result.valid,
        security_score: result.security_score,
        quality_score: result.quality_score,
        issues: result.issues,
        issue_count: result.issues.length,
        critical_count: result.issues.filter((i) => i.severity === "critical").length,
      },
      ...(result.issues.length > 0 ? {
        warnings: result.issues.filter((i) => i.severity === "critical").map((i) => `Line ${i.line || "?"}: ${i.message}`),
      } : {}),
    });
  }

  private async handleScore(args: any) {
    const file: string = args.file;
    const promptFile: string | undefined = args.prompt_file;
    const skillFile: string | undefined = args.skill_file;

    const filePath = path.isAbsolute(file) ? file : path.join(PROJECT_ROOT, file);
    let content: string;
    try {
      content = await fs.readFile(filePath, "utf-8");
    } catch {
      return respondError(`File not found: ${file}`);
    }

    // Validate for scores
    const validation = this.validator.validate(content);
    const lines = content.split("\n");
    const nonEmpty = lines.filter((l) => l.trim()).length;
    const codeLines = lines.filter((l) => l.trim() && !l.startsWith("//") && !l.startsWith("#")).length;

    // Heuristic scoring
    const relevance = Math.min(100, Math.max(20, codeLines > 5 ? 70 : 30));
    const correctness = validation.valid ? 80 : 40;
    const quality = validation.quality_score;
    const security = validation.security_score;
    const overall = Math.round((relevance + correctness + quality + security) / 4);

    // Log score for skill effectiveness tracking
    const scoreLog = path.join(MEMORY_PATH, "snapshots", "scores.jsonl");
    const scoreEntry = {
      timestamp: new Date().toISOString(),
      file,
      skill_file: skillFile || null,
      prompt_file: promptFile || null,
      overall,
      relevance,
      correctness,
      quality,
      security,
    };

    try {
      await fs.mkdir(path.dirname(scoreLog), { recursive: true });
      await fs.appendFile(scoreLog, JSON.stringify(scoreEntry) + "\n");
    } catch { /* ignore */ }

    return respond({
      status: "success",
      operation: "copilot_score",
      summary: `Score: ${overall}/100 (R:${relevance} C:${correctness} Q:${quality} S:${security})`,
      metadata: {
        file,
        overall,
        relevance,
        correctness,
        quality,
        security,
        lines: { total: lines.length, code: codeLines, non_empty: nonEmpty },
        skill_file: skillFile || null,
        issues: validation.issues.length,
      },
    });
  }

  private async handleBatchExecute(args: any) {
    const prompts: Array<{ prompt_file: string; output_file: string; task_id?: string }> = args.prompts;

    if (!prompts || prompts.length === 0) {
      return respondError("No prompts provided");
    }

    // Conflict detection: check for duplicate output files
    const outputFiles = prompts.map((p) => p.output_file);
    const duplicates = outputFiles.filter((f, i) => outputFiles.indexOf(f) !== i);
    if (duplicates.length > 0) {
      return respondError(`Conflict: duplicate output files detected: ${[...new Set(duplicates)].join(", ")}`);
    }

    const results: Array<{ prompt_file: string; output_file: string; status: string; error?: string }> = [];

    for (const prompt of prompts) {
      try {
        await this.handleExecute({
          prompt_file: prompt.prompt_file,
          output_file: prompt.output_file,
          task_id: prompt.task_id || `batch_${Date.now()}_${results.length}`,
          use_cache: true,
        });
        results.push({ prompt_file: prompt.prompt_file, output_file: prompt.output_file, status: "success" });
      } catch (err: any) {
        results.push({ prompt_file: prompt.prompt_file, output_file: prompt.output_file, status: "error", error: err.message });
      }
    }

    const succeeded = results.filter((r) => r.status === "success").length;

    return respond({
      status: "success",
      operation: "copilot_batch_execute",
      summary: `Batch: ${succeeded}/${prompts.length} succeeded`,
      metadata: { total: prompts.length, succeeded, failed: prompts.length - succeeded, results },
    });
  }

  private async handlePreview(args: any) {
    const promptFile: string = args.prompt_file;
    const targetFile: string | undefined = args.target_file;

    const promptPath = path.isAbsolute(promptFile) ? promptFile : path.join(MEMORY_PATH, promptFile);
    let promptContent: string;
    try {
      promptContent = await fs.readFile(promptPath, "utf-8");
    } catch {
      return respondError(`Prompt file not found: ${promptFile}`);
    }

    let existingContent = "";
    if (targetFile) {
      const targetPath = path.isAbsolute(targetFile) ? targetFile : path.join(PROJECT_ROOT, targetFile);
      try {
        existingContent = await fs.readFile(targetPath, "utf-8");
      } catch { /* no existing file */ }
    }

    return respond({
      status: "success",
      operation: "copilot_preview",
      summary: `Preview for ${promptFile}${targetFile ? ` (diff against ${targetFile})` : ""}`,
      metadata: {
        prompt_file: promptFile,
        prompt_preview: promptContent.slice(0, 2000),
        prompt_length: promptContent.length,
        target_file: targetFile || null,
        existing_content_length: existingContent.length,
        has_existing: existingContent.length > 0,
      },
    });
  }

  // =========================================================================
  // New v2 handlers
  // =========================================================================

  private async handleGetContext(args: any) {
    const targetFile: string = args.target_file;
    const maxDepth: number = args.max_depth ?? 1;
    const includeTypes: boolean = args.include_types ?? true;
    const includeGitDiff: boolean = args.include_git_diff ?? true;

    const context = await this.contextGatherer.gatherContext(targetFile, {
      maxDepth,
      includeTypes,
      includeGitDiff,
    });

    return respond({
      status: "success",
      operation: "copilot_get_context",
      summary: `Context gathered for ${targetFile} (${context.length} chars)`,
      metadata: {
        target_file: targetFile,
        context_length: context.length,
        context,
      },
    });
  }

  private async handleCacheClear(args: any) {
    const scope: "all" | "expired" | "today" = args?.scope || "all";
    const result = this.cache.clear(scope);

    return respond({
      status: "success",
      operation: "copilot_cache_clear",
      summary: `Cleared ${result.cleared} cache entries (scope: ${scope})`,
      metadata: { scope, cleared: result.cleared },
    });
  }

  private async handleCacheStats() {
    const stats = this.cache.getStats();

    return respond({
      status: "success",
      operation: "copilot_cache_stats",
      summary: `Cache: ${stats.total_entries} entries, ${stats.hit_rate} hit rate`,
      metadata: stats,
    });
  }

  private async handleAnalyzeFailure(args: any) {
    const promptFile: string = args.prompt_file;
    const outputFile: string | undefined = args.output_file;
    const validationErrors: string[] | undefined = args.validation_errors;
    const expected: string | undefined = args.expected;

    const promptPath = path.isAbsolute(promptFile) ? promptFile : path.join(MEMORY_PATH, promptFile);
    const outputPath = outputFile
      ? (path.isAbsolute(outputFile) ? outputFile : path.join(PROJECT_ROOT, outputFile))
      : undefined;

    const analysis = await this.failureAnalyzer.analyze(
      promptPath,
      outputPath,
      validationErrors,
      expected
    );

    return respond({
      status: "success",
      operation: "analyze_failure",
      summary: `Failure category: ${analysis.category} (confidence: ${analysis.confidence})`,
      metadata: analysis,
      next_steps: [
        ...analysis.suggested_prompt_improvements.slice(0, 3),
        "Use suggest_skill_update to propose skill file changes",
      ],
    });
  }

  private async handleSuggestSkillUpdate(args: any) {
    const promptFile: string = args.prompt_file;
    const skillFile: string = args.skill_file;
    const outputFile: string | undefined = args.output_file;
    const validationErrors: string[] | undefined = args.validation_errors;

    const promptPath = path.isAbsolute(promptFile) ? promptFile : path.join(MEMORY_PATH, promptFile);
    const outputPath = outputFile
      ? (path.isAbsolute(outputFile) ? outputFile : path.join(PROJECT_ROOT, outputFile))
      : undefined;

    // First analyze the failure
    const analysis = await this.failureAnalyzer.analyze(promptPath, outputPath, validationErrors);

    // Then suggest skill updates
    const skillPath = path.join(SKILLS_DIR, skillFile);
    const suggestion = await this.failureAnalyzer.suggestSkillUpdate(analysis, skillPath);

    return respond({
      status: "success",
      operation: "suggest_skill_update",
      summary: `Skill update suggestion for ${skillFile} (priority: ${suggestion.priority})`,
      metadata: {
        analysis_category: analysis.category,
        suggestion,
      },
      warnings: [
        "This is a SUGGESTION only. Review and approve before applying changes.",
        "Use memory_update to apply approved changes to the skill file.",
      ],
    });
  }

  // =========================================================================
  // Server lifecycle
  // =========================================================================

  async run() {
    // Ensure required directories
    await fs.mkdir(SKILLS_DIR, { recursive: true });
    await fs.mkdir(GENERATED_DIR, { recursive: true });

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    log.info("Running on stdio", { tools: 11, prompts: 2, version: "2.0.0" });
  }
}

const server = new CopilotServer();
server.run().catch(console.error);
