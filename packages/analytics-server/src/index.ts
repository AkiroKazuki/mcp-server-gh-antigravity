#!/usr/bin/env node

/**
 * Antigravity OS v2.1 - Analytics Server
 * 14 tools + 2 prompts: 5 enhanced from v1 + 9 new tools + 1 new prompt.
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
import type Database from "better-sqlite3";
import { BudgetEnforcer } from "./budget-enforcer.js";
import { PerformanceProfiler } from "./performance.js";
import { HealthMonitor } from "./health-monitor.js";
import { getEfficiencyRulesPrompt, Logger, respondError, withToolHandler, getConnection } from "@antigravity-os/shared";
import {
  LogCostSchema, GetCostSummarySchema, GetInsightsSchema,
  CheckBudgetSchema, GetPerformanceProfileSchema, GetBottlenecksSchema,
  ExportAnalyticsSchema, SetRateLimitSchema, LogResearchOutcomeSchema,
  getAnalyticsToolDefinitions,
} from "./schemas.js";
import {
  type AnalyticsContext,
  handleLogCost, handleGetCostSummary, handleCheckBudget, handlePredictMonthlyCost,
  handleSetRateLimit, handleGetRateLimitStatus,
  handleGetCopilotPerformance, handleGetInsights, handleGetPerformanceProfile,
  handleSystemHealth, handleGetSkillEffectiveness, handleGetBottlenecks,
  handleExportAnalytics, handleLogResearchOutcome,
} from "./handlers/index.js";

const log = new Logger("analytics-server");

// --- Configuration ---

const PROJECT_ROOT = process.env.PROJECT_ROOT || process.cwd();
const MEMORY_DIR = process.env.MEMORY_DIR || ".memory";
const MEMORY_PATH = path.join(PROJECT_ROOT, MEMORY_DIR);
const DB_PATH = path.join(MEMORY_PATH, "antigravity.db");

// --- Server ---

class AnalyticsServer {
  private server: Server;
  private budget: BudgetEnforcer;
  private profiler!: PerformanceProfiler;
  private health: HealthMonitor;
  private db!: Database.Database;

  constructor() {
    this.server = new Server(
      { name: "antigravity-analytics", version: "2.1.0" },
      { capabilities: { tools: {}, prompts: {} } }
    );
    this.budget = new BudgetEnforcer(PROJECT_ROOT);
    this.health = new HealthMonitor(PROJECT_ROOT);

    this.setupHandlers();

    this.server.onerror = (error) => {
      log.error("Server error", { error: String(error) });
    };
  }

  private setupHandlers() {
    // --- Tool listing ---
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: getAnalyticsToolDefinitions(),
    }));

    // --- Prompt listing ---
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => ({
      prompts: [
        {
          name: "efficiency_rules",
          description: "Core Antigravity OS efficiency rules for reducing token waste.",
        },
        {
          name: "cost_awareness",
          description: "Budget awareness and cost optimization guidelines.",
        },
      ],
    }));

    // --- Prompt handler ---
    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name } = request.params;

      switch (name) {
        case "efficiency_rules":
          return getEfficiencyRulesPrompt();

        case "cost_awareness":
          return {
            description: "Budget awareness and cost optimization",
            messages: [{
              role: "user" as const,
              content: {
                type: "text" as const,
                text: [
                  "# Cost Awareness Guidelines",
                  "",
                  "## Before Every Operation",
                  "1. Run `check_budget` to verify budget availability",
                  "2. Estimate token usage for expensive operations",
                  "3. Check if a cached result exists before regenerating",
                  "",
                  "## Budget Thresholds",
                  "- Daily limit: Configured in .memory/config/budget.json",
                  "- Alert at 80% of daily limit",
                  "- Hard stop at 100% (unless emergency_override is true)",
                  "",
                  "## Cost Optimization",
                  "- Use `predict_monthly_cost` to track spending trends",
                  "- Review `get_bottlenecks` to find expensive operations",
                  "- Use `get_skill_effectiveness` to identify which prompts give best ROI",
                  "- Cache successful responses to avoid paying twice",
                  "- Batch similar operations to reduce overhead",
                  "",
                  "## Rate Limiting",
                  "- Use `set_rate_limit` for operations that should be throttled",
                  "- Monitor with `get_rate_limit_status`",
                  "- Rate limits use sliding windows (per minute/hour/day)",
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
      }, this.profiler, "analytics-server");
    });
  }

  private get ctx(): AnalyticsContext {
    return {
      db: this.db,
      budget: this.budget,
      profiler: this.profiler,
      health: this.health,
      memoryPath: MEMORY_PATH,
    };
  }

  private async dispatch(name: string, args: unknown) {
    switch (name) {
      case "log_cost": return await handleLogCost(this.ctx, LogCostSchema.parse(args));
      case "get_cost_summary": return await handleGetCostSummary(this.ctx, GetCostSummarySchema.parse(args));
      case "get_copilot_performance": return await handleGetCopilotPerformance(this.ctx);
      case "get_insights": return await handleGetInsights(this.ctx, GetInsightsSchema.parse(args));
      case "check_budget": return await handleCheckBudget(this.ctx, CheckBudgetSchema.parse(args));
      case "get_performance_profile": return await handleGetPerformanceProfile(this.ctx, GetPerformanceProfileSchema.parse(args));
      case "system_health": return await handleSystemHealth(this.ctx);
      case "get_skill_effectiveness": return await handleGetSkillEffectiveness(this.ctx);
      case "predict_monthly_cost": return await handlePredictMonthlyCost(this.ctx);
      case "get_bottlenecks": return await handleGetBottlenecks(this.ctx, GetBottlenecksSchema.parse(args));
      case "export_analytics": return await handleExportAnalytics(this.ctx, ExportAnalyticsSchema.parse(args));
      case "set_rate_limit": return await handleSetRateLimit(this.ctx, SetRateLimitSchema.parse(args));
      case "get_rate_limit_status": return await handleGetRateLimitStatus(this.ctx);
      case "log_research_outcome": return await handleLogResearchOutcome(this.ctx, LogResearchOutcomeSchema.parse(args));
      default:
        return respondError(`Unknown tool: ${name}`);
    }
  }

  // =========================================================================
  // Server lifecycle
  // =========================================================================

  async run() {
    await fs.mkdir(path.join(MEMORY_PATH, "snapshots"), { recursive: true });
    await fs.mkdir(path.join(MEMORY_PATH, "config"), { recursive: true });

    // Initialize shared SQLite database for analytics data
    this.db = getConnection(DB_PATH);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cost_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        agent TEXT NOT NULL,
        tokens INTEGER NOT NULL,
        cost_usd REAL NOT NULL,
        task_description TEXT,
        timestamp TEXT NOT NULL,
        duration_ms REAL
      );
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
      CREATE TABLE IF NOT EXISTS research_outcomes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        research_id TEXT NOT NULL,
        implementation_file TEXT NOT NULL,
        outcome TEXT NOT NULL,
        metrics TEXT,
        confidence_after REAL
      );
    `);

    this.profiler = new PerformanceProfiler(DB_PATH);

    await this.budget.loadConfig();

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    log.info("Running on stdio", { tools: 14, prompts: 2, version: "2.1.0" });
  }
}

const server = new AnalyticsServer();
server.run().catch(console.error);
