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
import Database from "better-sqlite3";
import { Validator } from "./validator.js";
import { CacheManager } from "./cache-manager.js";
import { ContextGatherer } from "./context-gatherer.js";
import { FailureAnalyzer } from "./failure-analyzer.js";
import { LoopDetector } from "./loop-detector.js";
import { CliExecutor } from "./cli-executor.js";
import { ResearchIntegration } from "./research-integration.js";
import { getEfficiencyRulesPrompt, Logger, respondError, withToolHandler } from "@antigravity-os/shared";
import {
  GeneratePromptSchema, ExecuteSchema, ValidateSchema, ScoreSchema,
  BatchExecuteSchema, PreviewSchema, GetContextSchema, CacheClearSchema,
  AnalyzeFailureSchema, SuggestSkillUpdateSchema, ExecuteAndValidateSchema,
  ImplementWithResearchSchema, getCopilotToolDefinitions,
} from "./schemas.js";
import {
  type CopilotContext,
  handleGeneratePrompt, handlePreview,
  handleExecute, handleBatchExecute, handleExecuteAndValidate,
  handleValidate, handleScore, handleAnalyzeFailure, handleSuggestSkillUpdate,
  handleGetContext, handleCacheClear, handleCacheStats,
  handleImplementWithResearch,
} from "./handlers/index.js";

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
  private db!: Database.Database;
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
        return await this.dispatch(name, args);
      });
    });
  }

  private get ctx(): CopilotContext {
    return {
      validator: this.validator,
      cache: this.cache,
      contextGatherer: this.contextGatherer,
      failureAnalyzer: this.failureAnalyzer,
      loopDetector: this.loopDetector,
      cliExecutor: this.cliExecutor,
      researchIntegration: this.researchIntegration,
      db: this.db,
      memoryPath: MEMORY_PATH,
      skillsDir: SKILLS_DIR,
      generatedDir: GENERATED_DIR,
    };
  }

  private async dispatch(name: string, args: unknown) {
    switch (name) {
      case "copilot_generate_prompt": return await handleGeneratePrompt(this.ctx, GeneratePromptSchema.parse(args));
      case "copilot_execute": return await handleExecute(this.ctx, ExecuteSchema.parse(args));
      case "copilot_validate": return await handleValidate(this.ctx, ValidateSchema.parse(args));
      case "copilot_score": return await handleScore(this.ctx, ScoreSchema.parse(args));
      case "copilot_batch_execute": return await handleBatchExecute(this.ctx, BatchExecuteSchema.parse(args));
      case "copilot_preview": return await handlePreview(this.ctx, PreviewSchema.parse(args));
      case "copilot_get_context": return await handleGetContext(this.ctx, GetContextSchema.parse(args));
      case "copilot_cache_clear": return await handleCacheClear(this.ctx, CacheClearSchema.parse(args));
      case "copilot_cache_stats": return await handleCacheStats(this.ctx);
      case "analyze_failure": return await handleAnalyzeFailure(this.ctx, AnalyzeFailureSchema.parse(args));
      case "suggest_skill_update": return await handleSuggestSkillUpdate(this.ctx, SuggestSkillUpdateSchema.parse(args));
      case "copilot_execute_and_validate": return await handleExecuteAndValidate(this.ctx, ExecuteAndValidateSchema.parse(args));
      case "implement_with_research_context": return await handleImplementWithResearch(this.ctx, ImplementWithResearchSchema.parse(args));
      default:
        return respondError(`Unknown tool: ${name}`);
    }
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
    this.db = new Database(DB_PATH, { timeout: 5000 });
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        file TEXT NOT NULL,
        skill_file TEXT,
        prompt_file TEXT,
        overall INTEGER NOT NULL,
        relevance INTEGER NOT NULL,
        correctness INTEGER NOT NULL,
        quality INTEGER NOT NULL,
        security INTEGER NOT NULL
      );
    `);

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    log.info("Running on stdio", { tools: 13, prompts: 2, version: "2.1.0" });
  }
}

const server = new CopilotServer();
server.run().catch(console.error);
