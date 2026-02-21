#!/usr/bin/env node

/**
 * Antigravity OS v2.1 - Memory Server
 * 20 tools: 12 enhanced from v1 + 6 temporal memory tools + 2 research tools.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs/promises";
import path from "node:path";
import { glob } from "glob";
import { FileLockManager } from "./lock-manager.js";
import { GitPersistence } from "./git-persistence.js";
import { SemanticSearch } from "./semantic-search.js";
import { TemporalMemory } from "./temporal.js";
import { Logger } from "@antigravity-os/shared";
import { ResearchImporter } from "./research-importer.js";

const log = new Logger("memory-server");

// --- Configuration ---

const PROJECT_ROOT = process.env.PROJECT_ROOT || process.cwd();
const MEMORY_DIR = process.env.MEMORY_DIR || ".memory";
const MEMORY_PATH = path.join(PROJECT_ROOT, MEMORY_DIR);
const DB_PATH = path.join(MEMORY_PATH, "antigravity.db");

const FILE_MAP = {
  tech_stack: "core/tech_stack.md",
  project_overview: "core/project_overview.md",
  architecture: "core/architecture.md",
  active_context: "active/context.md",
  task_queue: "active/task_queue.md",
  blockers: "active/blockers.md",
  decisions_active: "decisions/ACTIVE.md",
  best_practices: "lessons/best_practices.md",
  bugs_fixed: "lessons/bugs_fixed.md",
  anti_patterns: "lessons/anti_patterns.md",
} as const;

type FileKey = keyof typeof FILE_MAP;
const VALID_FILE_KEYS = Object.keys(FILE_MAP) as FileKey[];

const CATEGORY_DIRS = {
  decisions: "decisions",
  lessons: "lessons",
  core: "core",
  active: "active",
  patterns: "lessons",
  all: "",
} as const;

type CategoryKey = keyof typeof CATEGORY_DIRS;

function getFilePath(key: string): string | undefined {
  return (FILE_MAP as Record<string, string>)[key];
}

function getCategoryDir(key: string): string | undefined {
  return (CATEGORY_DIRS as Record<string, string>)[key];
}

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

class MemoryServer {
  private server: Server;
  private lockManager: FileLockManager;
  private git: GitPersistence;
  private semantic: SemanticSearch;
  private temporal!: TemporalMemory;
  private research: ResearchImporter;
  private idempotencyCache: Map<string, { result: unknown; timestamp: number }> = new Map();
  private static readonly IDEMPOTENCY_TTL_MS = 3600000; // 1 hour

  constructor() {
    this.server = new Server(
      { name: "antigravity-memory", version: "2.1.0" },
      { capabilities: { tools: {} } }
    );
    this.lockManager = new FileLockManager();
    this.git = new GitPersistence(MEMORY_PATH);
    this.semantic = new SemanticSearch(MEMORY_PATH);
    this.research = new ResearchImporter(MEMORY_PATH);

    this.setupToolHandlers();

    this.server.onerror = (error) => {
      log.error("Server error", { error: String(error) });
    };
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        // --- Enhanced v1 tools ---
        {
          name: "memory_search",
          description:
            "Search across memory files with confidence ranking. Uses semantic search when available.",
          inputSchema: {
            type: "object" as const,
            properties: {
              query: { type: "string", description: "Search query" },
              categories: {
                type: "array",
                items: { type: "string" },
                description: 'Filter by category: "decisions", "lessons", "core", "active", "patterns", "all"',
              },
              top_k: { type: "number", description: "Number of results (default: 5)" },
              min_confidence: { type: "number", description: "Minimum confidence threshold (0-1)" },
              include_metadata: { type: "boolean", description: "Include confidence metadata in results" },
            },
            required: ["query"],
          },
        },
        {
          name: "memory_read",
          description: "Read a specific memory file by name. Returns full content (no summaries unless >5000 lines). Includes confidence data.",
          inputSchema: {
            type: "object" as const,
            properties: {
              file: {
                type: "string",
                enum: Object.keys(FILE_MAP),
                description: "Memory file to read",
              },
              chunk: {
                type: "number",
                description: "Chunk index for files >5000 lines (default: 0)",
              },
            },
            required: ["file"],
          },
        },
        {
          name: "memory_update",
          description: "Update a memory file. Thread-safe with file locking, git auto-commit, and temporal metadata.",
          inputSchema: {
            type: "object" as const,
            properties: {
              file: { type: "string", enum: Object.keys(FILE_MAP), description: "Memory file to update" },
              operation: { type: "string", enum: ["append", "replace", "update_section"], description: "Type of update" },
              content: { type: "string", description: "Content to add/update" },
              section: { type: "string", description: "Section header to update (for update_section operation)" },
            },
            required: ["file", "operation", "content"],
          },
        },
        {
          name: "memory_log_decision",
          description: "Log a structured architectural decision with confidence tracking. Returns: { status, summary, metadata: { file, title, temporal_entry } }",
          inputSchema: {
            type: "object" as const,
            properties: {
              title: { type: "string", description: "Decision title" },
              what: { type: "string", description: "One-sentence summary" },
              why: { type: "string", description: "Reasoning (2-3 sentences)" },
              alternatives: { type: "array", items: { type: "string" }, description: "Options considered" },
              impact: { type: "string", description: "What this changes" },
              idempotency_key: { type: "string", description: "Unique key to prevent duplicate entries on retry" },
            },
            required: ["title", "what", "why"],
          },
        },
        {
          name: "memory_log_lesson",
          description: "Log a bug fix, pattern, or anti-pattern with validation tracking. Returns: { status, summary, metadata: { file, title, temporal_entry } }",
          inputSchema: {
            type: "object" as const,
            properties: {
              category: { type: "string", description: 'Category (e.g., "Python Typing")' },
              type: { type: "string", enum: ["bug", "pattern", "anti_pattern"], description: "Type of lesson" },
              title: { type: "string", description: "Brief description" },
              symptom: { type: "string", description: "What went wrong (for bugs)" },
              root_cause: { type: "string", description: "Why it happened" },
              fix: { type: "string", description: "How we fixed it" },
              prevention: { type: "string", description: "How to avoid in future" },
              idempotency_key: { type: "string", description: "Unique key to prevent duplicate entries on retry" },
            },
            required: ["category", "type", "title"],
          },
        },
        {
          name: "memory_snapshot",
          description: "Create a backup snapshot of all memory files with confidence data.",
          inputSchema: {
            type: "object" as const,
            properties: {
              tag: { type: "string", description: "Optional tag for this snapshot" },
            },
          },
        },
        {
          name: "get_context_summary",
          description: "Get compressed project state summary with confidence filtering.",
          inputSchema: {
            type: "object" as const,
            properties: {
              focus_area: { type: "string", description: '"architecture", "recent_changes", "blockers", "tech_stack"' },
              min_confidence: { type: "number", description: "Filter by minimum confidence (0-1)" },
            },
          },
        },
        {
          name: "memory_history",
          description: "Get git history of a memory file with confidence evolution.",
          inputSchema: {
            type: "object" as const,
            properties: {
              file: { type: "string", enum: Object.keys(FILE_MAP), description: "Memory file" },
              limit: { type: "number", description: "Number of commits (default: 10)" },
            },
            required: ["file"],
          },
        },
        {
          name: "memory_rollback",
          description: "Rollback a memory file to a previous commit. Preserves confidence metadata.",
          inputSchema: {
            type: "object" as const,
            properties: {
              file: { type: "string", enum: Object.keys(FILE_MAP), description: "Memory file" },
              commit_hash: { type: "string", description: "Git commit hash from memory_history" },
            },
            required: ["file", "commit_hash"],
          },
        },
        {
          name: "memory_diff",
          description: "Show what changed in a memory file including confidence changes.",
          inputSchema: {
            type: "object" as const,
            properties: {
              file: { type: "string", enum: Object.keys(FILE_MAP), description: "Memory file" },
              commit_hash: { type: "string", description: "Compare to specific commit" },
            },
            required: ["file"],
          },
        },
        {
          name: "reindex_memory",
          description: "Rebuild semantic search index and sync temporal metadata from markdown.",
          inputSchema: {
            type: "object" as const,
            properties: {
              force: { type: "boolean", description: "Force reindex even if recently indexed" },
            },
          },
        },
        {
          name: "show_locks",
          description: "Show currently locked files and queue status (for debugging).",
          inputSchema: { type: "object" as const, properties: {} },
        },
        // --- New v2 tools ---
        {
          name: "validate_memory",
          description: "Validate a memory entry to boost its confidence score.",
          inputSchema: {
            type: "object" as const,
            properties: {
              entry_id: { type: "string", description: "Memory entry ID to validate" },
              notes: { type: "string", description: "Optional validation notes" },
            },
            required: ["entry_id"],
          },
        },
        {
          name: "memory_health_report",
          description: "Get confidence distribution, alerts, and health score for all memory entries.",
          inputSchema: { type: "object" as const, properties: {} },
        },
        {
          name: "detect_contradictions",
          description: "Find contradictory memory entries using semantic similarity analysis.",
          inputSchema: {
            type: "object" as const,
            properties: {
              category: { type: "string", description: "Filter by category" },
              threshold: { type: "number", description: "Similarity threshold (default: 0.7)" },
            },
          },
        },
        {
          name: "suggest_pruning",
          description: "Get dry-run recommendations for archiving low-confidence entries.",
          inputSchema: {
            type: "object" as const,
            properties: {
              confidence_threshold: { type: "number", description: "Max confidence to consider (default: 0.3)" },
              age_days: { type: "number", description: "Min age to consider (default: 90)" },
            },
          },
        },
        {
          name: "apply_pruning",
          description: "Archive low-confidence entries. Requires entry IDs from suggest_pruning.",
          inputSchema: {
            type: "object" as const,
            properties: {
              entry_ids: { type: "array", items: { type: "string" }, description: "Entry IDs to archive" },
            },
            required: ["entry_ids"],
          },
        },
        {
          name: "memory_undo",
          description: "Undo recent memory operations using git rollback. Max 10 steps.",
          inputSchema: {
            type: "object" as const,
            properties: {
              steps: { type: "number", description: "Number of operations to undo (default: 1, max: 10)" },
            },
          },
        },
        // --- New v2.1 tools ---
        {
          name: "import_research_analysis",
          description: "Import markdown analysis from Claude Sonnet research session. Intelligently parses sections and structures into memory categories. Handles variable markdown formats.",
          inputSchema: {
            type: "object" as const,
            properties: {
              markdown_content: { type: "string", description: "Full markdown content from Sonnet (.md file content)" },
              title: { type: "string", description: "Research title (e.g., 'Mean Reversion EUR/USD Analysis')" },
              tags: { type: "array", items: { type: "string" }, description: "Tags for categorization (e.g., ['mean-reversion', 'EUR/USD'])" },
              source: { type: "string", description: "Source reference (e.g., 'Journal of Finance 2024')" },
            },
            required: ["markdown_content", "title"],
          },
        },
        {
          name: "get_research_context",
          description: "Get specific research sections for implementation. Returns full content (no summaries) for use in Copilot prompts.",
          inputSchema: {
            type: "object" as const,
            properties: {
              research_id: { type: "string", description: "Research ID from import_research_analysis" },
              sections: { type: "array", items: { type: "string" }, description: "Sections to retrieve (e.g., ['implementation', 'findings']). Omit for all." },
              specific_topic: { type: "string", description: "Optional: Extract only content related to specific topic (e.g., 'stop loss')" },
            },
            required: ["research_id"],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      try {
        switch (name) {
          case "memory_search": return await this.handleSearch(args);
          case "memory_read": return await this.handleRead(args);
          case "memory_update": return await this.handleUpdate(args);
          case "memory_log_decision": return await this.handleLogDecision(args);
          case "memory_log_lesson": return await this.handleLogLesson(args);
          case "memory_snapshot": return await this.handleSnapshot(args);
          case "get_context_summary": return await this.handleContextSummary(args);
          case "memory_history": return await this.handleHistory(args);
          case "memory_rollback": return await this.handleRollback(args);
          case "memory_diff": return await this.handleDiff(args);
          case "reindex_memory": return await this.handleReindex(args);
          case "show_locks": return await this.handleShowLocks();
          case "validate_memory": return await this.handleValidateMemory(args);
          case "memory_health_report": return await this.handleHealthReport();
          case "detect_contradictions": return await this.handleDetectContradictions(args);
          case "suggest_pruning": return await this.handleSuggestPruning(args);
          case "apply_pruning": return await this.handleApplyPruning(args);
          case "memory_undo": return await this.handleUndo(args);
          case "import_research_analysis": return await this.handleImportResearch(args);
          case "get_research_context": return await this.handleGetResearchContext(args);
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

  private async handleSearch(args: any) {
    const query: string = args.query;
    const categories: string[] = args.categories || ["all"];
    const topK: number = args.top_k || 5;
    const minConfidence: number | undefined = args.min_confidence;
    const includeMetadata: boolean = args.include_metadata ?? false;

    // Try semantic search first
    try {
      const semanticResults = await this.semantic.search(query, topK * 2);
      if (semanticResults.length > 0) {
        let filtered = categories.includes("all")
          ? semanticResults
          : semanticResults.filter((r) => categories.includes(r.category));

        // Apply confidence filter if specified
        if (minConfidence !== undefined) {
          const entries = this.temporal.getAllEntries(undefined, minConfidence);
          const highConfFiles = new Set(entries.map((e) => e.file));
          filtered = filtered.filter((r) => highConfFiles.has(r.file));
        }

        const results = filtered.slice(0, topK).map((r) => {
          const result: any = {
            file: r.file,
            category: r.category,
            preview: r.content.slice(0, 300),
            similarity: r.similarity.toFixed(3),
          };

          if (includeMetadata) {
            const entries = this.temporal.getAllEntries();
            const match = entries.find((e) => e.file === r.file);
            if (match) {
              result.confidence = match.confidence;
              result.confidence_status = this.temporal.getConfidenceStatus(match.confidence);
              result.last_validated = match.last_validated;
            }
          }

          return result;
        });

        return respond({
          status: "success",
          operation: "memory_search",
          summary: `Found ${results.length} results via semantic search`,
          metadata: { method: "semantic", result_count: results.length, results },
        });
      }
    } catch {
      // Fall through to keyword search
    }

    // Keyword search fallback
    const results = await this.keywordSearch(query, categories, topK);
    return respond({
      status: "success",
      operation: "memory_search",
      summary: `Found ${results.length} results via keyword search`,
      metadata: { method: "keyword", result_count: results.length, results },
    });
  }

  private async keywordSearch(query: string, categories: string[], topK: number) {
    const searchDirs = categories.includes("all")
      ? [MEMORY_PATH]
      : categories
        .map((c) => getCategoryDir(c))
        .filter((d): d is string => Boolean(d))
        .map((d) => path.join(MEMORY_PATH, d));

    const results: Array<{ file: string; preview: string; matches: number; category: string }> = [];

    for (const dir of searchDirs) {
      let files: string[];
      try {
        files = await glob("**/*.md", { cwd: dir, absolute: true });
      } catch { continue; }

      for (const file of files) {
        try {
          const content = await fs.readFile(file, "utf-8");
          const terms = query.toLowerCase().split(/\s+/);
          const lower = content.toLowerCase();
          const matchCount = terms.reduce((acc, term) => acc + (lower.includes(term) ? 1 : 0), 0);

          if (matchCount > 0) {
            const relPath = path.relative(MEMORY_PATH, file);
            const paragraphs = content.split("\n\n");
            let bestPara = "";
            let bestScore = 0;
            for (const p of paragraphs) {
              const pLower = p.toLowerCase();
              const score = terms.reduce((a, t) => a + (pLower.includes(t) ? 1 : 0), 0);
              if (score > bestScore) { bestScore = score; bestPara = p; }
            }

            results.push({
              file: relPath,
              preview: bestPara.slice(0, 300),
              matches: matchCount,
              category: this.categorizeFile(relPath),
            });
          }
        } catch { continue; }
      }
    }

    results.sort((a, b) => b.matches - a.matches);
    return results.slice(0, topK);
  }

  private async handleRead(args: any) {
    const fileKey: string = args.file;
    const relPath = getFilePath(fileKey);
    if (!relPath) {
      return respondError(`Unknown file: ${fileKey}. Available: ${Object.keys(FILE_MAP).join(", ")}`);
    }

    const fullPath = path.join(MEMORY_PATH, relPath);
    try {
      const content = await fs.readFile(fullPath, "utf-8");
      const lineCount = content.split("\n").length;

      // Attach confidence data for entries matching this file
      const entries = this.temporal.getAllEntries();
      const fileEntries = entries.filter((e) => e.file === relPath);
      const confidence = fileEntries.length > 0
        ? fileEntries.reduce((sum, e) => sum + e.confidence, 0) / fileEntries.length
        : null;

      // v2.1: Return full content for files <5000 lines, chunk for larger
      if (lineCount <= 5000) {
        return respond({
          status: "success",
          operation: "memory_read",
          summary: `Read ${relPath} (${lineCount} lines, full content)`,
          metadata: {
            file: relPath,
            content,
            line_count: lineCount,
            confidence: confidence !== null ? parseFloat(confidence.toFixed(3)) : "no_entries",
            tracked_entries: fileEntries.length,
          },
        });
      } else {
        // Chunk large files
        const lines = content.split("\n");
        const chunkSize = 5000;
        const totalChunks = Math.ceil(lines.length / chunkSize);
        const chunk = args.chunk ?? 0;
        const start = chunk * chunkSize;
        const end = Math.min(start + chunkSize, lines.length);
        const chunkContent = lines.slice(start, end).join("\n");

        return respond({
          status: "success",
          operation: "memory_read",
          summary: `Read ${relPath} chunk ${chunk + 1}/${totalChunks} (${lineCount} total lines)`,
          metadata: {
            file: relPath,
            content: chunkContent,
            line_count: lineCount,
            chunk: chunk,
            total_chunks: totalChunks,
            chunk_lines: end - start,
            confidence: confidence !== null ? parseFloat(confidence.toFixed(3)) : "no_entries",
            tracked_entries: fileEntries.length,
            note: `Content split into ${totalChunks} chunks. Use memory_read with chunk parameter to read more.`,
          },
        });
      }
    } catch {
      return respondError(`File not found: ${relPath}. Create it first by using memory_update with operation "replace".`);
    }
  }

  private async handleUpdate(args: any) {
    const fileKey: string = args.file;
    const operation: string = args.operation;
    const content: string = args.content;
    const section: string | undefined = args.section;

    const relPath = getFilePath(fileKey);
    if (!relPath) return respondError(`Unknown file: ${fileKey}`);

    const fullPath = path.join(MEMORY_PATH, relPath);

    return await this.lockManager.withLock(fullPath, async () => {
      await fs.mkdir(path.dirname(fullPath), { recursive: true });

      if (operation === "append") {
        try {
          await fs.access(fullPath);
          await fs.appendFile(fullPath, "\n" + content);
        } catch {
          await fs.writeFile(fullPath, content, "utf-8");
        }
      } else if (operation === "replace") {
        await fs.writeFile(fullPath, content, "utf-8");
      } else if (operation === "update_section") {
        if (!section) return respondError("section parameter required for update_section operation");
        await this.updateSection(fullPath, section, content);
      }

      await this.git.commitChanges(fullPath, operation.toUpperCase(), `${operation} ${fileKey}`);
      const commitHash = await this.git.getLatestCommitHash();

      // Log to temporal
      this.temporal.logOperation(`memory_update:${operation}`, relPath, commitHash ?? undefined, undefined, `Updated ${fileKey}`);

      return respond({
        status: "success",
        operation: "memory_update",
        summary: `${operation} on ${relPath}`,
        metadata: { file: relPath, operation, preview: content.slice(0, 200), commit_hash: commitHash },
      });
    });
  }

  private async updateSection(filepath: string, sectionHeader: string, newContent: string): Promise<void> {
    let existing: string;
    try { existing = await fs.readFile(filepath, "utf-8"); } catch { existing = ""; }

    const lines = existing.split("\n");
    const headerLevel = sectionHeader.startsWith("###") ? 3 : sectionHeader.startsWith("##") ? 2 : 1;
    const headerPrefix = "#".repeat(headerLevel) + " ";
    const searchHeader = sectionHeader.startsWith("#") ? sectionHeader : `## ${sectionHeader}`;

    let startIdx = -1;
    let endIdx = lines.length;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === searchHeader.trim()) {
        startIdx = i;
      } else if (startIdx >= 0 && i > startIdx && lines[i].startsWith(headerPrefix.slice(0, headerLevel + 1))) {
        endIdx = i;
        break;
      }
    }

    if (startIdx >= 0) {
      const before = lines.slice(0, startIdx);
      const after = lines.slice(endIdx);
      const updated = [...before, searchHeader, newContent, ...after].join("\n");
      await fs.writeFile(filepath, updated, "utf-8");
    } else {
      await fs.appendFile(filepath, `\n\n${searchHeader}\n${newContent}`);
    }
  }

  private async handleLogDecision(args: any) {
    // Idempotency check
    if (args.idempotency_key) {
      const cached = this.checkIdempotency(args.idempotency_key);
      if (cached) return cached;
    }

    const date = new Date().toISOString().split("T")[0];
    const entry = [
      `\n## ${date}: ${args.title}`,
      `**What:** ${args.what}`,
      `**Why:** ${args.why}`,
      args.alternatives?.length ? `**Alternatives:** ${args.alternatives.join(", ")}` : null,
      args.impact ? `**Impact:** ${args.impact}` : null,
      "\n---",
    ].filter(Boolean).join("\n");

    const fullPath = path.join(MEMORY_PATH, "decisions/ACTIVE.md");

    return await this.lockManager.withLock(fullPath, async () => {
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      try {
        await fs.access(fullPath);
        await fs.appendFile(fullPath, "\n" + entry);
      } catch {
        await fs.writeFile(fullPath, "# Active Decisions\n" + entry, "utf-8");
      }

      await this.git.commitChanges(fullPath, "DECISION", `Logged: ${args.title}`);
      const commitHash = await this.git.getLatestCommitHash();

      // Create temporal entry
      const tEntry = this.temporal.createEntry(
        `Decision: ${args.title} - ${args.what}`,
        "decisions/ACTIVE.md",
        "decision",
        `${date}: ${args.title}`,
        ["decision"]
      );
      this.temporal.logOperation("memory_log_decision", "decisions/ACTIVE.md", commitHash ?? undefined, tEntry.id, args.title);

      const result = respond({
        status: "success",
        operation: "memory_log_decision",
        summary: `Logged decision: ${args.title}`,
        metadata: { decision: args.title, date, file: "decisions/ACTIVE.md", entry_id: tEntry.id, confidence: tEntry.confidence },
      });

      if (args.idempotency_key) {
        this.storeIdempotency(args.idempotency_key, result);
      }
      return result;
    });
  }

  private async handleLogLesson(args: any) {
    // Idempotency check
    if (args.idempotency_key) {
      const cached = this.checkIdempotency(args.idempotency_key);
      if (cached) return cached;
    }

    const typeFileMap: Record<string, string> = {
      bug: "lessons/bugs_fixed.md",
      pattern: "lessons/best_practices.md",
      anti_pattern: "lessons/anti_patterns.md",
    };

    const relPath = typeFileMap[args.type];
    if (!relPath) return respondError(`Unknown lesson type: ${args.type}`);

    const fullPath = path.join(MEMORY_PATH, relPath);
    const parts = [`\n### ${args.category}: ${args.title}`];
    if (args.symptom) parts.push(`**Symptom:** ${args.symptom}`);
    if (args.root_cause) parts.push(`**Root Cause:** ${args.root_cause}`);
    if (args.fix) parts.push(`**Fix:** ${args.fix}`);
    if (args.prevention) parts.push(`**Prevention:** ${args.prevention}`);
    parts.push("\n---");
    const entryText = parts.join("\n");

    const headerMap: Record<string, string> = {
      bug: "# Bugs Fixed", pattern: "# Best Practices", anti_pattern: "# Anti-Patterns",
    };

    return await this.lockManager.withLock(fullPath, async () => {
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      try {
        await fs.access(fullPath);
        await fs.appendFile(fullPath, "\n" + entryText);
      } catch {
        await fs.writeFile(fullPath, headerMap[args.type] + "\n" + entryText, "utf-8");
      }

      await this.git.commitChanges(fullPath, "LESSON", `${args.type}: ${args.title}`);
      const commitHash = await this.git.getLatestCommitHash();

      const tEntry = this.temporal.createEntry(
        `${args.type}: ${args.category} - ${args.title}`,
        relPath,
        "lesson",
        `${args.category}: ${args.title}`,
        [args.type, args.category]
      );
      this.temporal.logOperation("memory_log_lesson", relPath, commitHash ?? undefined, tEntry.id, args.title);

      const result = respond({
        status: "success",
        operation: "memory_log_lesson",
        summary: `Logged ${args.type}: ${args.title}`,
        metadata: { type: args.type, category: args.category, title: args.title, file: relPath, entry_id: tEntry.id },
      });

      if (args.idempotency_key) {
        this.storeIdempotency(args.idempotency_key, result);
      }
      return result;
    });
  }

  private async handleSnapshot(args: any) {
    const tag = args?.tag || "";
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const snapshotName = tag ? `snapshot_${tag}_${timestamp}.json` : `snapshot_${timestamp}.json`;

    const snapshotDir = path.join(MEMORY_PATH, "snapshots");
    await fs.mkdir(snapshotDir, { recursive: true });

    const snapshot: Record<string, any> = {
      created_at: new Date().toISOString(),
      tag: tag || null,
      version: "2.1.0",
      files: {},
      confidence_data: {},
    };

    for (const [key, relPath] of Object.entries(FILE_MAP)) {
      const fullPath = path.join(MEMORY_PATH, relPath);
      try { snapshot.files[key] = await fs.readFile(fullPath, "utf-8"); } catch { snapshot.files[key] = null; }
    }

    // Include confidence data
    const entries = this.temporal.getAllEntries();
    snapshot.confidence_data = {
      total_entries: entries.length,
      avg_confidence: entries.length > 0 ? entries.reduce((s, e) => s + e.confidence, 0) / entries.length : 0,
      entries: entries.map((e) => ({ id: e.id, file: e.file, confidence: e.confidence, category: e.category })),
    };

    const snapshotPath = path.join(snapshotDir, snapshotName);
    await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), "utf-8");

    return respond({
      status: "success",
      operation: "memory_snapshot",
      summary: `Snapshot created: ${snapshotName}`,
      metadata: {
        snapshot_file: path.relative(MEMORY_PATH, snapshotPath),
        tag: tag || null,
        files_captured: Object.keys(snapshot.files).length,
        entries_tracked: entries.length,
        timestamp: snapshot.created_at,
      },
    });
  }

  private async handleContextSummary(args: any) {
    const focusArea: string | undefined = args?.focus_area;
    const minConfidence: number = args?.min_confidence ?? 0;

    const summary: Record<string, any> = {};

    const extractSummary = async (fileKey: string): Promise<string | null> => {
      const relPath = getFilePath(fileKey);
      if (!relPath) return null;
      try {
        const content = await fs.readFile(path.join(MEMORY_PATH, relPath), "utf-8");
        const lines = content.split("\n").filter((l) => l.trim() && !l.startsWith("#")).slice(0, 5);
        return lines.join("\n");
      } catch { return null; }
    };

    if (!focusArea || focusArea === "tech_stack") summary.tech_stack = await extractSummary("tech_stack");
    if (!focusArea || focusArea === "architecture") {
      summary.architecture = await extractSummary("architecture");
      summary.project_overview = await extractSummary("project_overview");
    }
    if (!focusArea || focusArea === "recent_changes") {
      summary.decisions = await extractSummary("decisions_active");
      summary.recent_lessons = await extractSummary("bugs_fixed");
    }
    if (!focusArea || focusArea === "blockers") {
      summary.blockers = await extractSummary("blockers");
      summary.task_queue = await extractSummary("task_queue");
    }
    summary.active_context = await extractSummary("active_context");

    // Add confidence overview
    const entries = this.temporal.getAllEntries(undefined, minConfidence > 0 ? minConfidence : undefined);
    summary.confidence_overview = {
      tracked_entries: entries.length,
      high_confidence: entries.filter((e) => e.confidence >= 0.7).length,
      medium_confidence: entries.filter((e) => e.confidence >= 0.4 && e.confidence < 0.7).length,
      low_confidence: entries.filter((e) => e.confidence < 0.4).length,
    };

    return respond({
      status: "success",
      operation: "get_context_summary",
      summary: `Context summary for ${focusArea || "all"}`,
      metadata: { focus: focusArea || "all", summary },
    });
  }

  private async handleHistory(args: any) {
    const fileKey: string = args.file;
    const limit: number = args.limit || 10;
    const relPath = getFilePath(fileKey);
    if (!relPath) return respondError(`Unknown file: ${fileKey}`);

    const fullPath = path.join(MEMORY_PATH, relPath);
    const history = await this.git.getHistory(fullPath, limit);

    return respond({
      status: "success",
      operation: "memory_history",
      summary: `${history.length} commits for ${relPath}`,
      metadata: { file: relPath, commits: history.length, history },
    });
  }

  private async handleRollback(args: any) {
    const fileKey: string = args.file;
    const commitHash: string = args.commit_hash;
    const relPath = getFilePath(fileKey);
    if (!relPath) return respondError(`Unknown file: ${fileKey}`);

    const fullPath = path.join(MEMORY_PATH, relPath);

    return await this.lockManager.withLock(fullPath, async () => {
      await this.git.rollback(fullPath, commitHash);
      this.temporal.logOperation("memory_rollback", relPath, commitHash, undefined, `Rolled back to ${commitHash}`);

      return respond({
        status: "success",
        operation: "memory_rollback",
        summary: `Rolled back ${relPath} to ${commitHash}`,
        metadata: { file: relPath, rolled_back_to: commitHash },
      });
    });
  }

  private async handleDiff(args: any) {
    const fileKey: string = args.file;
    const commitHash: string | undefined = args.commit_hash;
    const relPath = getFilePath(fileKey);
    if (!relPath) return respondError(`Unknown file: ${fileKey}`);

    const fullPath = path.join(MEMORY_PATH, relPath);
    const diff = await this.git.getDiff(fullPath, commitHash);

    return respond({
      status: "success",
      operation: "memory_diff",
      summary: diff ? `Changes found for ${relPath}` : `No changes for ${relPath}`,
      metadata: { file: relPath, diff: diff || "No changes found." },
    });
  }

  private async handleReindex(args: any) {
    // Sync temporal metadata from markdown files
    const newEntries = await this.temporal.syncFromMarkdown();

    // Apply decay to all entries
    const decayed = this.temporal.applyDecay();

    // Rebuild semantic index
    let semanticResult = { chunksIndexed: 0, filesProcessed: 0 };
    try {
      semanticResult = await this.semantic.indexMemory();
    } catch (err: any) {
      log.warn("Semantic indexing failed", { error: err.message });
    }

    return respond({
      status: "success",
      operation: "reindex_memory",
      summary: `Reindexed: ${semanticResult.chunksIndexed} chunks, ${newEntries} new entries synced, ${decayed} confidence scores updated`,
      metadata: {
        semantic: semanticResult,
        temporal: { new_entries_synced: newEntries, confidence_decayed: decayed },
      },
    });
  }

  private async handleShowLocks() {
    const locks = this.lockManager.getActiveLocks();
    return respond({
      status: "success",
      operation: "show_locks",
      summary: `${locks.length} active locks`,
      metadata: {
        active_locks: locks.length,
        locks: locks.map((l) => ({
          file: path.relative(MEMORY_PATH, l.file),
          queue_length: l.queueLength,
        })),
      },
    });
  }

  // =========================================================================
  // New v2 handlers
  // =========================================================================

  private async handleValidateMemory(args: any) {
    const entryId: string = args.entry_id;
    const notes: string | undefined = args.notes;

    const result = this.temporal.validateEntry(entryId, notes);

    this.temporal.logOperation("validate_memory", undefined, undefined, entryId, notes ?? "validated");

    return respond({
      status: "success",
      operation: "validate_memory",
      summary: `Entry ${entryId} validated. Confidence: ${result.new_confidence.toFixed(3)} (${result.status})`,
      metadata: {
        entry_id: entryId,
        new_confidence: result.new_confidence,
        confidence_status: result.status,
        notes: notes || null,
      },
    });
  }

  private async handleHealthReport() {
    const report = this.temporal.getHealthReport();

    return respond({
      status: "success",
      operation: "memory_health_report",
      summary: `Health score: ${report.health_score}/100. ${report.summary.total_entries} entries tracked.`,
      metadata: report,
    });
  }

  private async handleDetectContradictions(args: any) {
    const category: string | undefined = args.category;
    const threshold: number = args.threshold ?? 0.7;

    const entries = this.temporal.getAllEntries(category);

    if (entries.length < 2) {
      return respond({
        status: "success",
        operation: "detect_contradictions",
        summary: "Not enough entries to check for contradictions",
        metadata: { contradictions: [], checked_pairs: 0 },
      });
    }

    // Conflict keyword pairs
    const conflictPairs = [
      ["use", "avoid"], ["prefer", "discourage"], ["yes", "no"],
      ["enable", "disable"], ["always", "never"], ["should", "should not"],
    ];

    const contradictions: Array<{
      entry1: { id: string; file: string; preview: string; confidence: number };
      entry2: { id: string; file: string; preview: string; confidence: number };
      similarity: number;
      conflict_type: string;
    }> = [];

    let checkedPairs = 0;

    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        checkedPairs++;
        const similarity = await this.semantic.pairwiseSimilarity(
          entries[i].content, entries[j].content
        );

        if (similarity >= threshold) {
          // Check for conflict keywords
          const c1 = entries[i].content.toLowerCase();
          const c2 = entries[j].content.toLowerCase();

          let conflictType = "similar_content";
          for (const [a, b] of conflictPairs) {
            if ((c1.includes(a) && c2.includes(b)) || (c1.includes(b) && c2.includes(a))) {
              conflictType = "direct";
              break;
            }
          }

          contradictions.push({
            entry1: { id: entries[i].id, file: entries[i].file, preview: entries[i].content.slice(0, 100), confidence: entries[i].confidence },
            entry2: { id: entries[j].id, file: entries[j].file, preview: entries[j].content.slice(0, 100), confidence: entries[j].confidence },
            similarity: parseFloat(similarity.toFixed(3)),
            conflict_type: conflictType,
          });
        }
      }
    }

    // Sort by confidence difference (easiest to resolve first)
    contradictions.sort((a, b) =>
      Math.abs(a.entry1.confidence - a.entry2.confidence) -
      Math.abs(b.entry1.confidence - b.entry2.confidence)
    );

    return respond({
      status: "success",
      operation: "detect_contradictions",
      summary: `Found ${contradictions.length} potential contradictions in ${checkedPairs} pairs`,
      metadata: { contradictions, checked_pairs: checkedPairs, threshold },
      ...(contradictions.length > 0 ? {
        next_steps: [
          "Review each contradiction and resolve by updating or archiving one entry",
          "Use validate_memory to boost the correct entry's confidence",
          "Use apply_pruning to remove the incorrect entry",
        ],
      } : {}),
    });
  }

  private async handleSuggestPruning(args: any) {
    const confidenceThreshold: number | undefined = args.confidence_threshold;
    const ageDays: number | undefined = args.age_days;

    const candidates = this.temporal.getPruningCandidates(confidenceThreshold, ageDays);

    return respond({
      status: "success",
      operation: "suggest_pruning",
      summary: `${candidates.length} entries recommended for pruning`,
      metadata: {
        candidates,
        threshold: confidenceThreshold ?? 0.3,
        age_days: ageDays ?? 90,
      },
      ...(candidates.length > 0 ? {
        next_steps: [
          "Review candidates and confirm which to archive",
          "Use apply_pruning with entry_ids to archive them",
          "Use validate_memory first if any should be kept",
        ],
        warnings: ["This is a dry run. No entries have been archived."],
      } : {}),
    });
  }

  private async handleApplyPruning(args: any) {
    const entryIds: string[] = args.entry_ids;

    if (!entryIds || entryIds.length === 0) {
      return respondError("No entry_ids provided. Use suggest_pruning first.");
    }

    const result = this.temporal.archiveEntries(entryIds);

    // Commit changes
    const commitHash = await this.git.commitAll("PRUNE", `Archived ${result.archived} entries`);

    this.temporal.logOperation(
      "apply_pruning",
      undefined,
      commitHash ?? undefined,
      undefined,
      `Archived ${result.archived} entries: ${entryIds.join(", ")}`
    );

    return respond({
      status: "success",
      operation: "apply_pruning",
      summary: `Archived ${result.archived} entries`,
      metadata: {
        archived: result.archived,
        entry_ids: entryIds,
        commit_hash: commitHash,
      },
    });
  }

  private async handleUndo(args: any) {
    const steps = Math.min(args?.steps || 1, 10);

    const operations = this.temporal.getRecentOperations(steps);

    if (operations.length === 0) {
      return respond({
        status: "success",
        operation: "memory_undo",
        summary: "No operations to undo",
        metadata: { undone: 0 },
      });
    }

    const undone: Array<{ operation: string; file?: string; commit_hash?: string }> = [];

    for (const op of operations) {
      if (op.commit_hash) {
        try {
          // Get the parent commit
          const { execFile } = await import("node:child_process");
          const { promisify } = await import("node:util");
          const execFileAsync = promisify(execFile);

          const { stdout } = await execFileAsync(
            "git", ["rev-parse", `${op.commit_hash}~1`],
            { cwd: MEMORY_PATH }
          );
          const parentHash = stdout.trim();

          if (parentHash && op.file) {
            const fullPath = path.join(MEMORY_PATH, op.file);
            await this.git.rollback(fullPath, parentHash);
            undone.push({ operation: op.operation, file: op.file, commit_hash: op.commit_hash });
          }
        } catch {
          // Could not undo this operation
        }
      }
    }

    // Log the undo itself
    this.temporal.logOperation("memory_undo", undefined, undefined, undefined, `Undid ${undone.length} operations`);

    return respond({
      status: "success",
      operation: "memory_undo",
      summary: `Undid ${undone.length} of ${steps} requested operations`,
      metadata: { undone: undone.length, operations_reversed: undone },
    });
  }

  // =========================================================================
  // New v2.1 handlers
  // =========================================================================

  private async handleImportResearch(args: any) {
    const { markdown_content, title, tags, source } = args;

    if (!markdown_content || !title) {
      return respondError("markdown_content and title are required");
    }

    const result = await this.research.importResearch({
      markdown_content,
      title,
      tags,
      source,
    });

    // Git commit the research import
    await this.git.commitAll("IMPORT", `Imported research: ${title}`);
    const commitHash = await this.git.getLatestCommitHash();

    // Create temporal entry for the research
    const tEntry = this.temporal.createEntry(
      `Research: ${title}`,
      `research/analyses/${result.researchId}/metadata.json`,
      "research",
      title,
      tags || [],
    );

    this.temporal.logOperation(
      "import_research_analysis",
      `research/analyses/${result.researchId}`,
      commitHash ?? undefined,
      tEntry.id,
      `Imported: ${title}`,
    );

    return respond({
      status: "success",
      operation: "import_research_analysis",
      summary: `Imported "${title}" with ${result.sections.length} structured sections`,
      metadata: {
        research_id: result.researchId,
        sections_found: result.sections,
        location: path.relative(MEMORY_PATH, result.researchDir),
        title,
        tags: tags || [],
        source: source || "Unknown",
        confidence: result.metadata.confidence,
        entry_id: tEntry.id,
      },
    });
  }

  private async handleGetResearchContext(args: any) {
    const { research_id, sections, specific_topic } = args;

    if (!research_id) {
      return respondError("research_id is required");
    }

    try {
      const result = await this.research.getResearchContext({
        research_id,
        sections,
        specific_topic,
      });

      return respond({
        status: "success",
        operation: "get_research_context",
        summary: `Retrieved ${Object.keys(result.content).length} sections for "${result.title}" (${result.full_content_length} chars)`,
        metadata: {
          research_id: result.research_id,
          title: result.title,
          source: result.source,
          tags: result.tags,
          content: result.content,
          full_content_length: result.full_content_length,
          sections_returned: Object.keys(result.content),
        },
      });
    } catch (error: any) {
      return respondError(`Research not found: ${research_id}. Error: ${error.message}`);
    }
  }

  // =========================================================================
  // Utilities
  // =========================================================================

  private categorizeFile(filepath: string): string {
    if (filepath.includes("decisions")) return "decision";
    if (filepath.includes("lessons")) return "lesson";
    if (filepath.includes("core")) return "core";
    if (filepath.includes("active")) return "active";
    return "other";
  }

  private checkIdempotency(key: string): unknown | null {
    const entry = this.idempotencyCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > MemoryServer.IDEMPOTENCY_TTL_MS) {
      this.idempotencyCache.delete(key);
      return null;
    }
    return entry.result;
  }

  private storeIdempotency(key: string, result: unknown): void {
    this.idempotencyCache.set(key, { result, timestamp: Date.now() });
    // Prune expired entries periodically
    if (this.idempotencyCache.size > 100) {
      const now = Date.now();
      for (const [k, v] of this.idempotencyCache) {
        if (now - v.timestamp > MemoryServer.IDEMPOTENCY_TTL_MS) {
          this.idempotencyCache.delete(k);
        }
      }
    }
  }

  async run() {
    // Ensure memory directories exist
    const dirs = ["core", "active", "decisions", "decisions/archive", "lessons", "prompts/templates", "prompts/generated", "snapshots", "config", "research/analyses", "research/outcomes"];
    for (const dir of dirs) {
      await fs.mkdir(path.join(MEMORY_PATH, dir), { recursive: true });
    }

    // Initialize database after directories exist
    this.temporal = new TemporalMemory(DB_PATH, MEMORY_PATH);

    // Initialize git
    await this.git.init();

    // Sync temporal metadata from existing markdown
    try {
      const synced = await this.temporal.syncFromMarkdown();
      if (synced > 0) {
        log.info("Migrated entries to v2 format", { synced });
      }
    } catch (err: any) {
      log.warn("Temporal sync warning", { error: err.message });
    }

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    log.info("Running on stdio", { tools: 20, version: "2.1.0" });
  }
}

const server = new MemoryServer();
server.run().catch(console.error);
