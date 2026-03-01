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
import { FileLockManager, getConnection } from "@antigravity-os/shared";
import { GitPersistence } from "./git-persistence.js";
import { SemanticSearch } from "./semantic-search.js";
import { TemporalMemory } from "./temporal.js";
import { Logger, respondError, withToolHandler } from "@antigravity-os/shared";
import { ResearchImporter } from "./research-importer.js";
import {
  MemorySearchSchema, MemoryReadSchema, MemoryUpdateSchema,
  MemoryLogDecisionSchema, MemoryLogLessonSchema, MemorySnapshotSchema,
  ContextSummarySchema, MemoryHistorySchema, MemoryRollbackSchema,
  MemoryDiffSchema, ReindexMemorySchema, ValidateMemorySchema,
  DetectContradictionsSchema, SuggestPruningSchema, ApplyPruningSchema,
  ResolveContradictionSchema,
  MemoryUndoSchema, ImportResearchSchema, GetResearchContextSchema,
  IngestUrlSchema,
  MemoryStageSchema, MemoryCommitStagedSchema,
  getMemoryToolDefinitions,
} from "./schemas.js";
import type Database from "better-sqlite3";
import {
  type MemoryContext,
  handleSearch, handleRead, handleUpdate, handleLogDecision, handleLogLesson,
  handleSnapshot, handleContextSummary, handleHistory, handleRollback, handleDiff, handleUndo,
  handleMemoryStage, handleMemoryCommitStaged,
  handleReindex, handleShowLocks, handleValidateMemory, handleHealthReport,
  handleDetectContradictions, handleSuggestPruning, handleApplyPruning, handleResolveContradiction,
  handleImportResearch, handleGetResearchContext, handleIngestUrl,
} from "./handlers/index.js";

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

// --- Server ---

class MemoryServer {
  private server: Server;
  private lockManager: FileLockManager;
  private git: GitPersistence;
  private semantic: SemanticSearch;
  private temporal!: TemporalMemory;
  private research: ResearchImporter;
  private idempotencyDb!: Database.Database;
  private static readonly IDEMPOTENCY_TTL_MS: Record<string, number> = {
    decision: 86400000, // 24 hours
    lesson: 86400000,   // 24 hours
    default: 3600000,   // 1 hour
  };

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
      tools: getMemoryToolDefinitions(VALID_FILE_KEYS as string[]),
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      return withToolHandler(log, name, async () => {
        return await this.dispatch(name, args);
      });
    });
  }

  private get ctx(): MemoryContext {
    return {
      lockManager: this.lockManager,
      git: this.git,
      semantic: this.semantic,
      temporal: this.temporal,
      research: this.research,
      memoryPath: MEMORY_PATH,
      fileMap: FILE_MAP as Record<string, string>,
      categoryDirs: CATEGORY_DIRS as Record<string, string>,
    };
  }

  private async dispatch(name: string, args: unknown) {
    const c = this.ctx;
    const checkIdem = (key: string, opType?: string) => this.checkIdempotency(key, opType);
    const storeIdem = (key: string, result: unknown, opType?: string) => this.storeIdempotency(key, result, opType);

    switch (name) {
      case "memory_search": return await handleSearch(c, MemorySearchSchema.parse(args));
      case "memory_read": return await handleRead(c, MemoryReadSchema.parse(args));
      case "memory_update": return await handleUpdate(c, MemoryUpdateSchema.parse(args));
      case "memory_log_decision": return await handleLogDecision(c, MemoryLogDecisionSchema.parse(args), checkIdem, storeIdem);
      case "memory_log_lesson": return await handleLogLesson(c, MemoryLogLessonSchema.parse(args), checkIdem, storeIdem);
      case "memory_snapshot": return await handleSnapshot(c, MemorySnapshotSchema.parse(args));
      case "get_context_summary": return await handleContextSummary(c, ContextSummarySchema.parse(args));
      case "memory_history": return await handleHistory(c, MemoryHistorySchema.parse(args));
      case "memory_rollback": return await handleRollback(c, MemoryRollbackSchema.parse(args));
      case "memory_diff": return await handleDiff(c, MemoryDiffSchema.parse(args));
      case "reindex_memory": return await handleReindex(c, ReindexMemorySchema.parse(args));
      case "show_locks": return await handleShowLocks(c);
      case "validate_memory": return await handleValidateMemory(c, ValidateMemorySchema.parse(args));
      case "memory_health_report": return await handleHealthReport(c);
      case "detect_contradictions": return await handleDetectContradictions(c, DetectContradictionsSchema.parse(args));
      case "suggest_pruning": return await handleSuggestPruning(c, SuggestPruningSchema.parse(args));
      case "apply_pruning": return await handleApplyPruning(c, ApplyPruningSchema.parse(args));
      case "resolve_contradiction": return await handleResolveContradiction(c, ResolveContradictionSchema.parse(args));
      case "memory_undo": return await handleUndo(c, MemoryUndoSchema.parse(args));
      case "import_research_analysis": return await handleImportResearch(c, ImportResearchSchema.parse(args));
      case "get_research_context": return await handleGetResearchContext(c, GetResearchContextSchema.parse(args));
      case "memory_ingest_url": return await handleIngestUrl(c, IngestUrlSchema.parse(args));
      case "memory_stage": return await handleMemoryStage(c, MemoryStageSchema.parse(args));
      case "memory_commit_staged": return await handleMemoryCommitStaged(c, MemoryCommitStagedSchema.parse(args));
      default:
        return respondError(`Unknown tool: ${name}`);
    }
  }

  private checkIdempotency(key: string, operationType: string = "default"): unknown | null {
    const row = this.idempotencyDb.prepare(
      "SELECT result, timestamp, operation_type FROM idempotency_cache WHERE key = ?"
    ).get(key) as { result: string; timestamp: number; operation_type: string } | undefined;
    if (!row) return null;
    const ttl = MemoryServer.IDEMPOTENCY_TTL_MS[row.operation_type] ?? MemoryServer.IDEMPOTENCY_TTL_MS.default;
    if (Date.now() - row.timestamp > ttl) {
      this.idempotencyDb.prepare("DELETE FROM idempotency_cache WHERE key = ?").run(key);
      return null;
    }
    return JSON.parse(row.result);
  }

  private storeIdempotency(key: string, result: unknown, operationType: string = "default"): void {
    this.idempotencyDb.prepare(
      "INSERT OR REPLACE INTO idempotency_cache (key, result, timestamp, operation_type) VALUES (?, ?, ?, ?)"
    ).run(key, JSON.stringify(result), Date.now(), operationType);
    // Prune expired entries (use shortest TTL for cleanup)
    this.idempotencyDb.prepare(
      "DELETE FROM idempotency_cache WHERE timestamp < ?"
    ).run(Date.now() - MemoryServer.IDEMPOTENCY_TTL_MS.default);
  }

  async run() {
    // Ensure memory directories exist
    const dirs = ["core", "active", "decisions", "decisions/archive", "lessons", "prompts/templates", "prompts/generated", "snapshots", "config", "research/analyses", "research/outcomes"];
    for (const dir of dirs) {
      await fs.mkdir(path.join(MEMORY_PATH, dir), { recursive: true });
    }

    // Initialize database after directories exist
    this.temporal = new TemporalMemory(DB_PATH, MEMORY_PATH);

    // Initialize idempotency cache in SQLite (survives restarts)
    this.idempotencyDb = getConnection(DB_PATH);
    this.idempotencyDb.exec(`
      CREATE TABLE IF NOT EXISTS idempotency_cache (
        key TEXT PRIMARY KEY,
        result TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        operation_type TEXT NOT NULL DEFAULT 'default'
      )
    `);

    // Wire semantic search to use SQLite
    this.semantic.setDatabase(this.idempotencyDb);

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
    log.info("Running on stdio", { tools: 24, version: "2.2.0" });
  }
}

const server = new MemoryServer();
server.run().catch(console.error);
