#!/usr/bin/env node

/**
 * Antigravity OS v2.1 - Copilot Server
 * 11 tools + 2 prompts: 8 enhanced from v1 + 3 new v2.1 tools.
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
import { CliExecutor } from "./cli-executor.js";
import { ResearchIntegration } from "./research-integration.js";
import { getEfficiencyRulesPrompt, Logger, respond, respondError, withToolHandler } from "@antigravity-os/shared";
import {
  GeneratePromptSchema, ExecuteSchema, ValidateSchema, ScoreSchema,
  BatchExecuteSchema, PreviewSchema, GetContextSchema, CacheClearSchema,
  AnalyzeFailureSchema, SuggestSkillUpdateSchema, ExecuteAndValidateSchema,
  ImplementWithResearchSchema, getCopilotToolDefinitions,
  type GeneratePromptArgs, type ExecuteArgs, type ValidateArgs, type ScoreArgs,
  type BatchExecuteArgs, type PreviewArgs, type GetContextArgs, type CacheClearArgs,
  type AnalyzeFailureArgs, type SuggestSkillUpdateArgs, type ExecuteAndValidateArgs,
  type ImplementWithResearchArgs,
} from "./schemas.js";

const log = new Logger("copilot-server");

// --- Configuration ---

const PROJECT_ROOT = process.env.PROJECT_ROOT || process.cwd();
const MEMORY_DIR = process.env.MEMORY_DIR || ".memory";
const MEMORY_PATH = path.join(PROJECT_ROOT, MEMORY_DIR);
const DB_PATH = path.join(MEMORY_PATH, "antigravity.db");
const SKILLS_DIR = path.join(MEMORY_PATH, "prompts", "templates");
const GENERATED_DIR = path.join(MEMORY_PATH, "prompts", "generated");

// --- Server ---

class CopilotServer {
  private server: Server;
  private validator: Validator;
  private cache!: CacheManager;
  private contextGatherer: ContextGatherer;
  private failureAnalyzer: FailureAnalyzer;
  private loopDetector: LoopDetector;
  private cliExecutor: CliExecutor;
  private researchIntegration: ResearchIntegration;

  constructor() {
    this.server = new Server(
      { name: "antigravity-copilot", version: "2.1.0" },
      { capabilities: { tools: {}, prompts: {} } }
    );
    this.validator = new Validator();
    this.contextGatherer = new ContextGatherer(PROJECT_ROOT);
    this.failureAnalyzer = new FailureAnalyzer();
    this.loopDetector = new LoopDetector();
    this.cliExecutor = new CliExecutor();
    this.researchIntegration = new ResearchIntegration(MEMORY_PATH, PROJECT_ROOT);

    this.setupHandlers();

    this.server.onerror = (error) => {
      log.error("Server error", { error: String(error) });
    };
  }

  private setupHandlers() {
    // --- Tool listing ---
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: getCopilotToolDefinitions(),
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
      return withToolHandler(log, name, async () => {
        switch (name) {
          case "copilot_generate_prompt": return await this.handleGeneratePrompt(GeneratePromptSchema.parse(args));
          case "copilot_execute": return await this.handleExecute(ExecuteSchema.parse(args));
          case "copilot_validate": return await this.handleValidate(ValidateSchema.parse(args));
          case "copilot_score": return await this.handleScore(ScoreSchema.parse(args));
          case "copilot_batch_execute": return await this.handleBatchExecute(BatchExecuteSchema.parse(args));
          case "copilot_preview": return await this.handlePreview(PreviewSchema.parse(args));
          case "copilot_get_context": return await this.handleGetContext(GetContextSchema.parse(args));
          case "copilot_cache_clear": return await this.handleCacheClear(CacheClearSchema.parse(args));
          case "copilot_cache_stats": return await this.handleCacheStats();
          case "analyze_failure": return await this.handleAnalyzeFailure(AnalyzeFailureSchema.parse(args));
          case "suggest_skill_update": return await this.handleSuggestSkillUpdate(SuggestSkillUpdateSchema.parse(args));
          case "copilot_execute_and_validate": return await this.handleExecuteAndValidate(ExecuteAndValidateSchema.parse(args));
          case "implement_with_research_context": return await this.handleImplementWithResearch(ImplementWithResearchSchema.parse(args));
          default:
            return respondError(`Unknown tool: ${name}`);
        }
      });
    });
  }

  // =========================================================================
  // Enhanced v1 handlers
  // =========================================================================

  private async handleGeneratePrompt(args: GeneratePromptArgs) {
    const { skill_file: skillFile, requirements, target_file: targetFile } = args;
    const contextFiles = args.context_files ?? [];
    const maxContextDepth = args.max_context_depth ?? 1;

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

  private async handleExecute(args: ExecuteArgs) {
    const { prompt_file: promptFile, output_file: outputFile } = args;
    const taskId = args.task_id ?? `task_${Date.now()}`;
    const useCache = args.use_cache ?? true;

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

  private async handleValidate(args: ValidateArgs) {
    const { file, requirements } = args;

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

  private async handleScore(args: ScoreArgs) {
    const { file, prompt_file: promptFile, skill_file: skillFile } = args;

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

  private async handleBatchExecute(args: BatchExecuteArgs) {
    const { prompts } = args;

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

  private async handlePreview(args: PreviewArgs) {
    const { prompt_file: promptFile, target_file: targetFile } = args;

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

  private async handleGetContext(args: GetContextArgs) {
    const { target_file: targetFile } = args;
    const maxDepth = args.max_depth ?? 1;
    const includeTypes = args.include_types ?? true;
    const includeGitDiff = args.include_git_diff ?? true;

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

  private async handleCacheClear(args: CacheClearArgs) {
    const scope = args.scope ?? "all";
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

  private async handleAnalyzeFailure(args: AnalyzeFailureArgs) {
    const { prompt_file: promptFile, output_file: outputFile, validation_errors: validationErrors, expected } = args;

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

  private async handleSuggestSkillUpdate(args: SuggestSkillUpdateArgs) {
    const { prompt_file: promptFile, skill_file: skillFile, output_file: outputFile, validation_errors: validationErrors } = args;

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
  // New v2.1 handlers
  // =========================================================================

  private async handleExecuteAndValidate(args: ExecuteAndValidateArgs) {
    const { prompt_file: promptFile, output_file: outputFile } = args;
    const requirements = args.requirements ?? [];
    const autoApprove = args.auto_approve_if_valid ?? false;

    const taskId = `${promptFile}:${outputFile}`;

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
    const cacheKey = this.cache.generateKey(promptContent, outputFile);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      const outPath = path.isAbsolute(outputFile) ? outputFile : path.join(PROJECT_ROOT, outputFile);
      await fs.mkdir(path.dirname(outPath), { recursive: true });
      await fs.writeFile(outPath, cached.response, "utf-8");

      // Validate cached code
      const validation = this.validator.validate(cached.response, requirements);

      return respond({
        status: "cached",
        operation: "copilot_execute_and_validate",
        summary: `Wrote cached result to ${outputFile}`,
        metadata: {
          output_file: outputFile,
          source: "cache",
          cache_key: cacheKey,
          hit_count: cached.hit_count,
          validation: {
            passed: validation.valid,
            issues: validation.issues,
            security_score: validation.security_score,
            quality_score: validation.quality_score,
            recommendation: validation.valid ? "APPROVE" : "REVIEW_REQUIRED",
          },
        },
      });
    }

    // Execute Copilot CLI
    log.info("Running copilot_execute_and_validate", { prompt_file: promptFile, output_file: outputFile });

    const result = await this.cliExecutor.execute(promptContent);

    // Write output
    const outPath = path.isAbsolute(outputFile) ? outputFile : path.join(PROJECT_ROOT, outputFile);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, result.code, "utf-8");

    // Validate
    const validation = this.validator.validate(result.code, requirements);

    // Cache if valid
    if (validation.valid) {
      this.cache.set(cacheKey, result.code, {
        task_id: taskId,
        prompt_file: promptFile,
        source: result.source,
      });
      this.loopDetector.reset(taskId);
    }

    return respond({
      status: validation.valid ? "success" : "validation_failed",
      operation: "copilot_execute_and_validate",
      summary: validation.valid
        ? `Generated and validated ${outputFile} (${result.lines_generated} lines)`
        : `Generated ${outputFile} but validation FAILED`,
      metadata: {
        output_file: outputFile,
        prompt_file: promptFile,
        source: result.source,
        lines_generated: result.lines_generated,
        execution_time_ms: result.execution_time_ms,
        validation: {
          passed: validation.valid,
          issues: validation.issues,
          security_score: validation.security_score,
          quality_score: validation.quality_score,
          recommendation: validation.valid ? "APPROVE" : "REVIEW_REQUIRED",
        },
        preview: result.code.slice(0, 300) + (result.code.length > 300 ? "..." : ""),
        auto_approved: autoApprove && validation.valid,
      },
    });
  }

  private async handleImplementWithResearch(args: ImplementWithResearchArgs) {
    const { research_id: researchId, task_description: taskDescription, file_path: filePath } = args;
    const researchSection = args.research_section;
    const specificTopic = args.specific_topic;
    const functionSignature = args.function_signature;
    const requirements = args.requirements ?? [];

    const steps: Array<{ step: string; [key: string]: unknown }> = [];

    // Step 1: Get research context
    let researchContext;
    try {
      researchContext = await this.researchIntegration.getResearchContext({
        research_id: researchId,
        sections: researchSection ? [researchSection] : undefined,
        specific_topic: specificTopic,
      });
      steps.push({ step: "research_loaded", sections: Object.keys(researchContext.content) });
    } catch (error: any) {
      return respondError(`Failed to load research ${researchId}: ${error.message}`);
    }

    // Step 2: Build prompt with research context
    const researchPrompt = this.researchIntegration.buildResearchPromptSection(researchContext);
    const additionalContext = await this.researchIntegration.getAdditionalContext();

    const promptParts = [
      `# Implementation Task`,
      `## Task: ${taskDescription}`,
      "",
      functionSignature ? `## Function Signature\n\`\`\`\n${functionSignature}\n\`\`\`\n` : "",
      requirements.length > 0 ? `## Requirements\n${requirements.map((r) => `- ${r}`).join("\n")}\n` : "",
      researchPrompt,
      additionalContext.tech_stack ? `## Tech Stack\n${additionalContext.tech_stack.slice(0, 2000)}\n` : "",
      additionalContext.lessons ? `## Relevant Lessons\n${additionalContext.lessons.slice(0, 1000)}\n` : "",
    ].filter(Boolean).join("\n");

    // Save prompt
    await fs.mkdir(GENERATED_DIR, { recursive: true });
    const promptFileName = `prompt_research_${Date.now()}.md`;
    const promptPath = path.join(GENERATED_DIR, promptFileName);
    await fs.writeFile(promptPath, promptParts, "utf-8");
    steps.push({ step: "prompt_generated", file: path.relative(MEMORY_PATH, promptPath) });

    // Step 3: Execute and validate
    const executionResult = await this.cliExecutor.execute(promptParts);

    const outPath = path.isAbsolute(filePath) ? filePath : path.join(PROJECT_ROOT, filePath);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, executionResult.code, "utf-8");

    const validation = this.validator.validate(executionResult.code, requirements);
    steps.push({
      step: "executed",
      source: executionResult.source,
      lines: executionResult.lines_generated,
      validation_passed: validation.valid,
    });

    // Step 4: Link to research if valid
    if (validation.valid) {
      await this.researchIntegration.addResearchLink(outPath, researchId, researchContext.title);
      steps.push({ step: "linked_to_research" });

      // Cache the result
      const cacheKey = this.cache.generateKey(promptParts, filePath);
      this.cache.set(cacheKey, executionResult.code, {
        research_id: researchId,
        source: executionResult.source,
      });
    }

    return respond({
      status: validation.valid ? "complete" : "needs_review",
      operation: "implement_with_research_context",
      summary: validation.valid
        ? `Implemented "${taskDescription}" using research "${researchContext.title}" (${executionResult.lines_generated} lines)`
        : `Generated code needs review for "${taskDescription}"`,
      metadata: {
        file: filePath,
        research: {
          id: researchId,
          title: researchContext.title,
          source: researchContext.source,
        },
        validation: {
          passed: validation.valid,
          issues: validation.issues,
          security_score: validation.security_score,
          quality_score: validation.quality_score,
          recommendation: validation.valid ? "APPROVE" : "REVIEW_REQUIRED",
        },
        execution: {
          source: executionResult.source,
          lines_generated: executionResult.lines_generated,
          execution_time_ms: executionResult.execution_time_ms,
        },
        steps,
      },
    });
  }

  // =========================================================================
  // Server lifecycle
  // =========================================================================

  async run() {
    // Ensure required directories
    await fs.mkdir(SKILLS_DIR, { recursive: true });
    await fs.mkdir(GENERATED_DIR, { recursive: true });
    await fs.mkdir(path.dirname(DB_PATH), { recursive: true });

    this.cache = new CacheManager(DB_PATH);

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    log.info("Running on stdio", { tools: 13, prompts: 2, version: "2.1.0" });
  }
}

const server = new CopilotServer();
server.run().catch(console.error);
