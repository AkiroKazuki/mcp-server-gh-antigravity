#!/usr/bin/env node

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

// --- Configuration ---

const PROJECT_ROOT = process.env.PROJECT_ROOT || process.cwd();
const MEMORY_DIR = process.env.MEMORY_DIR || ".memory";
const MEMORY_PATH = path.join(PROJECT_ROOT, MEMORY_DIR);

const FILE_MAP: Record<string, string> = {
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
};

const CATEGORY_DIRS: Record<string, string> = {
  decisions: "decisions",
  lessons: "lessons",
  core: "core",
  active: "active",
  patterns: "lessons",
  all: "",
};

// --- Server ---

class MemoryServer {
  private server: Server;
  private lockManager: FileLockManager;
  private git: GitPersistence;
  private semantic: SemanticSearch;

  constructor() {
    this.server = new Server(
      { name: "antigravity-memory", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );
    this.lockManager = new FileLockManager();
    this.git = new GitPersistence(MEMORY_PATH);
    this.semantic = new SemanticSearch(MEMORY_PATH);

    this.setupToolHandlers();

    this.server.onerror = (error) => {
      console.error("[memory-server] Error:", error);
    };
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "memory_search",
          description:
            "Search across memory files. Uses semantic search if available, falls back to keyword matching.",
          inputSchema: {
            type: "object" as const,
            properties: {
              query: { type: "string", description: "Search query" },
              categories: {
                type: "array",
                items: { type: "string" },
                description:
                  'Filter by category: "decisions", "lessons", "core", "active", "patterns", "all"',
              },
              top_k: {
                type: "number",
                description: "Number of results (default: 5)",
              },
            },
            required: ["query"],
          },
        },
        {
          name: "memory_read",
          description: "Read a specific memory file by name.",
          inputSchema: {
            type: "object" as const,
            properties: {
              file: {
                type: "string",
                enum: Object.keys(FILE_MAP),
                description: "Memory file to read",
              },
            },
            required: ["file"],
          },
        },
        {
          name: "memory_update",
          description:
            "Update a memory file. Thread-safe with file locking and git auto-commit.",
          inputSchema: {
            type: "object" as const,
            properties: {
              file: {
                type: "string",
                enum: Object.keys(FILE_MAP),
                description: "Memory file to update",
              },
              operation: {
                type: "string",
                enum: ["append", "replace", "update_section"],
                description: "Type of update",
              },
              content: { type: "string", description: "Content to add/update" },
              section: {
                type: "string",
                description:
                  "Section header to update (for update_section operation)",
              },
            },
            required: ["file", "operation", "content"],
          },
        },
        {
          name: "memory_log_decision",
          description:
            "Log a structured architectural decision to decisions/ACTIVE.md.",
          inputSchema: {
            type: "object" as const,
            properties: {
              title: { type: "string", description: "Decision title" },
              what: { type: "string", description: "One-sentence summary" },
              why: { type: "string", description: "Reasoning (2-3 sentences)" },
              alternatives: {
                type: "array",
                items: { type: "string" },
                description: "Options considered but not chosen",
              },
              impact: {
                type: "string",
                description: "What this changes",
              },
            },
            required: ["title", "what", "why"],
          },
        },
        {
          name: "memory_log_lesson",
          description:
            "Log a bug fix, pattern, or anti-pattern to the lessons folder.",
          inputSchema: {
            type: "object" as const,
            properties: {
              category: {
                type: "string",
                description: 'Category (e.g., "Python Typing", "Database")',
              },
              type: {
                type: "string",
                enum: ["bug", "pattern", "anti_pattern"],
                description: "Type of lesson",
              },
              title: { type: "string", description: "Brief description" },
              symptom: {
                type: "string",
                description: "What went wrong (for bugs)",
              },
              root_cause: {
                type: "string",
                description: "Why it happened (for bugs)",
              },
              fix: { type: "string", description: "How we fixed it" },
              prevention: {
                type: "string",
                description: "How to avoid in future",
              },
            },
            required: ["category", "type", "title"],
          },
        },
        {
          name: "memory_snapshot",
          description: "Create a backup snapshot of all memory files as JSON.",
          inputSchema: {
            type: "object" as const,
            properties: {
              tag: {
                type: "string",
                description: "Optional tag for this snapshot",
              },
            },
          },
        },
        {
          name: "get_context_summary",
          description:
            "Get compressed project state summary. Uses 90% fewer tokens than reading full memory files.",
          inputSchema: {
            type: "object" as const,
            properties: {
              focus_area: {
                type: "string",
                description:
                  'Optional focus: "architecture", "recent_changes", "blockers", "tech_stack"',
              },
            },
          },
        },
        {
          name: "memory_history",
          description:
            "Get git history of a memory file to see changes over time.",
          inputSchema: {
            type: "object" as const,
            properties: {
              file: {
                type: "string",
                enum: Object.keys(FILE_MAP),
                description: "Memory file to view history for",
              },
              limit: {
                type: "number",
                description: "Number of commits to show (default: 10)",
              },
            },
            required: ["file"],
          },
        },
        {
          name: "memory_rollback",
          description:
            "Rollback a memory file to a previous commit. Use when AI made a mistake.",
          inputSchema: {
            type: "object" as const,
            properties: {
              file: {
                type: "string",
                enum: Object.keys(FILE_MAP),
                description: "Memory file to rollback",
              },
              commit_hash: {
                type: "string",
                description: "Git commit hash from memory_history",
              },
            },
            required: ["file", "commit_hash"],
          },
        },
        {
          name: "memory_diff",
          description: "Show what changed in a memory file.",
          inputSchema: {
            type: "object" as const,
            properties: {
              file: {
                type: "string",
                enum: Object.keys(FILE_MAP),
                description: "Memory file to diff",
              },
              commit_hash: {
                type: "string",
                description: "Optional: compare to specific commit",
              },
            },
            required: ["file"],
          },
        },
        {
          name: "reindex_memory",
          description:
            "Rebuild semantic search index. Run after major memory changes or initial setup.",
          inputSchema: {
            type: "object" as const,
            properties: {
              force: {
                type: "boolean",
                description: "Force reindex even if recently indexed",
              },
            },
          },
        },
        {
          name: "show_locks",
          description:
            "Show currently locked files and queue status (for debugging).",
          inputSchema: {
            type: "object" as const,
            properties: {},
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      try {
        switch (name) {
          case "memory_search":
            return await this.handleSearch(args);
          case "memory_read":
            return await this.handleRead(args);
          case "memory_update":
            return await this.handleUpdate(args);
          case "memory_log_decision":
            return await this.handleLogDecision(args);
          case "memory_log_lesson":
            return await this.handleLogLesson(args);
          case "memory_snapshot":
            return await this.handleSnapshot(args);
          case "get_context_summary":
            return await this.handleContextSummary(args);
          case "memory_history":
            return await this.handleHistory(args);
          case "memory_rollback":
            return await this.handleRollback(args);
          case "memory_diff":
            return await this.handleDiff(args);
          case "reindex_memory":
            return await this.handleReindex(args);
          case "show_locks":
            return await this.handleShowLocks();
          default:
            return {
              content: [{ type: "text", text: `Unknown tool: ${name}` }],
              isError: true,
            };
        }
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    });
  }

  // --- Tool Handlers ---

  private async handleSearch(args: any) {
    const query: string = args.query;
    const categories: string[] = args.categories || ["all"];
    const topK: number = args.top_k || 5;

    // Try semantic search first
    try {
      const semanticResults = await this.semantic.search(query, topK);
      if (semanticResults.length > 0) {
        // Filter by category if specified
        const filtered = categories.includes("all")
          ? semanticResults
          : semanticResults.filter((r) => categories.includes(r.category));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  method: "semantic",
                  result_count: filtered.length,
                  results: filtered.map((r) => ({
                    file: r.file,
                    category: r.category,
                    preview: r.content.slice(0, 300),
                    similarity: r.similarity.toFixed(3),
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      }
    } catch {
      // Fall through to keyword search
    }

    // Keyword search fallback
    const results = await this.keywordSearch(query, categories, topK);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { method: "keyword", result_count: results.length, results },
            null,
            2
          ),
        },
      ],
    };
  }

  private async keywordSearch(
    query: string,
    categories: string[],
    topK: number
  ) {
    const searchDirs = categories.includes("all")
      ? [MEMORY_PATH]
      : categories
        .map((c) => CATEGORY_DIRS[c])
        .filter(Boolean)
        .map((d) => path.join(MEMORY_PATH, d));

    const results: Array<{ file: string; preview: string; matches: number; category: string }> = [];

    for (const dir of searchDirs) {
      let files: string[];
      try {
        files = await glob("**/*.md", { cwd: dir, absolute: true });
      } catch {
        continue;
      }

      for (const file of files) {
        try {
          const content = await fs.readFile(file, "utf-8");
          const terms = query.toLowerCase().split(/\s+/);
          const lower = content.toLowerCase();
          const matchCount = terms.reduce(
            (acc, term) => acc + (lower.includes(term) ? 1 : 0),
            0
          );

          if (matchCount > 0) {
            const relPath = path.relative(MEMORY_PATH, file);
            // Find best matching paragraph
            const paragraphs = content.split("\n\n");
            let bestPara = "";
            let bestScore = 0;
            for (const p of paragraphs) {
              const pLower = p.toLowerCase();
              const score = terms.reduce(
                (a, t) => a + (pLower.includes(t) ? 1 : 0),
                0
              );
              if (score > bestScore) {
                bestScore = score;
                bestPara = p;
              }
            }

            results.push({
              file: relPath,
              preview: bestPara.slice(0, 300),
              matches: matchCount,
              category: this.categorizeFile(relPath),
            });
          }
        } catch {
          continue;
        }
      }
    }

    results.sort((a, b) => b.matches - a.matches);
    return results.slice(0, topK);
  }

  private async handleRead(args: any) {
    const fileKey: string = args.file;
    const relPath = FILE_MAP[fileKey];
    if (!relPath) {
      return {
        content: [
          {
            type: "text",
            text: `Unknown file: ${fileKey}. Available: ${Object.keys(FILE_MAP).join(", ")}`,
          },
        ],
        isError: true,
      };
    }

    const fullPath = path.join(MEMORY_PATH, relPath);
    try {
      const content = await fs.readFile(fullPath, "utf-8");
      return { content: [{ type: "text", text: content }] };
    } catch {
      return {
        content: [
          {
            type: "text",
            text: `File not found: ${relPath}. Create it first by using memory_update with operation "replace".`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleUpdate(args: any) {
    const fileKey: string = args.file;
    const operation: string = args.operation;
    const content: string = args.content;
    const section: string | undefined = args.section;

    const relPath = FILE_MAP[fileKey];
    if (!relPath) {
      return {
        content: [
          { type: "text", text: `Unknown file: ${fileKey}` },
        ],
        isError: true,
      };
    }

    const fullPath = path.join(MEMORY_PATH, relPath);

    return await this.lockManager.withLock(fullPath, async () => {
      // Ensure directory exists
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
        if (!section) {
          return {
            content: [
              {
                type: "text",
                text: "section parameter required for update_section operation",
              },
            ],
            isError: true,
          };
        }
        await this.updateSection(fullPath, section, content);
      }

      await this.git.commitChanges(
        fullPath,
        operation.toUpperCase(),
        `${operation} ${fileKey}`
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              file: relPath,
              operation,
              preview: content.slice(0, 200),
            }),
          },
        ],
      };
    });
  }

  private async updateSection(
    filepath: string,
    sectionHeader: string,
    newContent: string
  ): Promise<void> {
    let existing: string;
    try {
      existing = await fs.readFile(filepath, "utf-8");
    } catch {
      existing = "";
    }

    const lines = existing.split("\n");
    const headerLevel = sectionHeader.startsWith("###")
      ? 3
      : sectionHeader.startsWith("##")
        ? 2
        : 1;
    const headerPrefix = "#".repeat(headerLevel) + " ";
    const searchHeader = sectionHeader.startsWith("#")
      ? sectionHeader
      : `## ${sectionHeader}`;

    let startIdx = -1;
    let endIdx = lines.length;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === searchHeader.trim()) {
        startIdx = i;
      } else if (
        startIdx >= 0 &&
        i > startIdx &&
        lines[i].startsWith(headerPrefix.slice(0, headerLevel + 1))
      ) {
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
      // Section not found, append it
      await fs.appendFile(filepath, `\n\n${searchHeader}\n${newContent}`);
    }
  }

  private async handleLogDecision(args: any) {
    const date = new Date().toISOString().split("T")[0];
    const entry = [
      `\n## ${date}: ${args.title}`,
      `**What:** ${args.what}`,
      `**Why:** ${args.why}`,
      args.alternatives?.length
        ? `**Alternatives:** ${args.alternatives.join(", ")}`
        : null,
      args.impact ? `**Impact:** ${args.impact}` : null,
      "\n---",
    ]
      .filter(Boolean)
      .join("\n");

    const fullPath = path.join(MEMORY_PATH, "decisions/ACTIVE.md");

    return await this.lockManager.withLock(fullPath, async () => {
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      try {
        await fs.access(fullPath);
        await fs.appendFile(fullPath, "\n" + entry);
      } catch {
        await fs.writeFile(
          fullPath,
          "# Active Decisions\n" + entry,
          "utf-8"
        );
      }

      await this.git.commitChanges(
        fullPath,
        "DECISION",
        `Logged: ${args.title}`
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              decision: args.title,
              date,
              file: "decisions/ACTIVE.md",
            }),
          },
        ],
      };
    });
  }

  private async handleLogLesson(args: any) {
    const typeFileMap: Record<string, string> = {
      bug: "lessons/bugs_fixed.md",
      pattern: "lessons/best_practices.md",
      anti_pattern: "lessons/anti_patterns.md",
    };

    const relPath = typeFileMap[args.type];
    if (!relPath) {
      return {
        content: [{ type: "text", text: `Unknown lesson type: ${args.type}` }],
        isError: true,
      };
    }

    const fullPath = path.join(MEMORY_PATH, relPath);

    const parts = [`\n### ${args.category}: ${args.title}`];
    if (args.symptom) parts.push(`**Symptom:** ${args.symptom}`);
    if (args.root_cause) parts.push(`**Root Cause:** ${args.root_cause}`);
    if (args.fix) parts.push(`**Fix:** ${args.fix}`);
    if (args.prevention) parts.push(`**Prevention:** ${args.prevention}`);
    parts.push("\n---");

    const entry = parts.join("\n");

    const headerMap: Record<string, string> = {
      bug: "# Bugs Fixed",
      pattern: "# Best Practices",
      anti_pattern: "# Anti-Patterns",
    };

    return await this.lockManager.withLock(fullPath, async () => {
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      try {
        await fs.access(fullPath);
        await fs.appendFile(fullPath, "\n" + entry);
      } catch {
        await fs.writeFile(
          fullPath,
          headerMap[args.type] + "\n" + entry,
          "utf-8"
        );
      }

      await this.git.commitChanges(
        fullPath,
        "LESSON",
        `${args.type}: ${args.title}`
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              type: args.type,
              category: args.category,
              title: args.title,
              file: relPath,
            }),
          },
        ],
      };
    });
  }

  private async handleSnapshot(args: any) {
    const tag = args?.tag || "";
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const snapshotName = tag
      ? `snapshot_${tag}_${timestamp}.json`
      : `snapshot_${timestamp}.json`;

    const snapshotDir = path.join(MEMORY_PATH, "snapshots");
    await fs.mkdir(snapshotDir, { recursive: true });

    const snapshot: Record<string, any> = {
      created_at: new Date().toISOString(),
      tag: tag || null,
      files: {},
    };

    for (const [key, relPath] of Object.entries(FILE_MAP)) {
      const fullPath = path.join(MEMORY_PATH, relPath);
      try {
        snapshot.files[key] = await fs.readFile(fullPath, "utf-8");
      } catch {
        snapshot.files[key] = null;
      }
    }

    const snapshotPath = path.join(snapshotDir, snapshotName);
    await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), "utf-8");

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            snapshot_file: path.relative(MEMORY_PATH, snapshotPath),
            tag: tag || null,
            files_captured: Object.keys(snapshot.files).length,
            timestamp: snapshot.created_at,
          }),
        },
      ],
    };
  }

  private async handleContextSummary(args: any) {
    const focusArea: string | undefined = args?.focus_area;

    const summary: Record<string, any> = {};

    // Read key files and extract summaries
    const extractSummary = async (
      fileKey: string
    ): Promise<string | null> => {
      const relPath = FILE_MAP[fileKey];
      if (!relPath) return null;
      try {
        const content = await fs.readFile(
          path.join(MEMORY_PATH, relPath),
          "utf-8"
        );
        // Extract first 3 non-empty, non-header lines as summary
        const lines = content
          .split("\n")
          .filter((l) => l.trim() && !l.startsWith("#"))
          .slice(0, 5);
        return lines.join("\n");
      } catch {
        return null;
      }
    };

    if (!focusArea || focusArea === "tech_stack") {
      summary.tech_stack = await extractSummary("tech_stack");
    }

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

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { focus: focusArea || "all", summary },
            null,
            2
          ),
        },
      ],
    };
  }

  private async handleHistory(args: any) {
    const fileKey: string = args.file;
    const limit: number = args.limit || 10;

    const relPath = FILE_MAP[fileKey];
    if (!relPath) {
      return {
        content: [{ type: "text", text: `Unknown file: ${fileKey}` }],
        isError: true,
      };
    }

    const fullPath = path.join(MEMORY_PATH, relPath);
    const history = await this.git.getHistory(fullPath, limit);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { file: relPath, commits: history.length, history },
            null,
            2
          ),
        },
      ],
    };
  }

  private async handleRollback(args: any) {
    const fileKey: string = args.file;
    const commitHash: string = args.commit_hash;

    const relPath = FILE_MAP[fileKey];
    if (!relPath) {
      return {
        content: [{ type: "text", text: `Unknown file: ${fileKey}` }],
        isError: true,
      };
    }

    const fullPath = path.join(MEMORY_PATH, relPath);

    return await this.lockManager.withLock(fullPath, async () => {
      await this.git.rollback(fullPath, commitHash);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              file: relPath,
              rolled_back_to: commitHash,
            }),
          },
        ],
      };
    });
  }

  private async handleDiff(args: any) {
    const fileKey: string = args.file;
    const commitHash: string | undefined = args.commit_hash;

    const relPath = FILE_MAP[fileKey];
    if (!relPath) {
      return {
        content: [{ type: "text", text: `Unknown file: ${fileKey}` }],
        isError: true,
      };
    }

    const fullPath = path.join(MEMORY_PATH, relPath);
    const diff = await this.git.getDiff(fullPath, commitHash);

    return {
      content: [
        {
          type: "text",
          text: diff || "No changes found.",
        },
      ],
    };
  }

  private async handleReindex(args: any) {
    const result = await this.semantic.indexMemory();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            ...result,
          }),
        },
      ],
    };
  }

  private async handleShowLocks() {
    const locks = this.lockManager.getActiveLocks();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              active_locks: locks.length,
              locks: locks.map((l) => ({
                file: path.relative(MEMORY_PATH, l.file),
                queue_length: l.queueLength,
              })),
            },
            null,
            2
          ),
        },
      ],
    };
  }

  private categorizeFile(filepath: string): string {
    if (filepath.includes("decisions")) return "decision";
    if (filepath.includes("lessons")) return "lesson";
    if (filepath.includes("core")) return "core";
    if (filepath.includes("active")) return "active";
    return "other";
  }

  async run() {
    // Ensure memory directories exist
    const dirs = [
      "core",
      "active",
      "decisions",
      "decisions/archive",
      "lessons",
      "prompts/templates",
      "prompts/generated",
      "snapshots",
      "config",
    ];
    for (const dir of dirs) {
      await fs.mkdir(path.join(MEMORY_PATH, dir), { recursive: true });
    }

    // Initialize git
    await this.git.init();

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("[memory-server] Running on stdio");
  }
}

const server = new MemoryServer();
server.run().catch(console.error);
