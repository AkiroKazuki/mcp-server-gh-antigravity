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
import Database from "better-sqlite3";
import { BudgetEnforcer } from "./budget-enforcer.js";
import { PerformanceProfiler } from "./performance.js";
import { HealthMonitor } from "./health-monitor.js";
import { getEfficiencyRulesPrompt, Logger, parseJsonl, respond, respondError, withToolHandler } from "@antigravity-os/shared";
import {
  LogCostSchema, GetCostSummarySchema, GetInsightsSchema,
  CheckBudgetSchema, GetPerformanceProfileSchema, GetBottlenecksSchema,
  ExportAnalyticsSchema, SetRateLimitSchema, LogResearchOutcomeSchema,
  getAnalyticsToolDefinitions,
  type LogCostArgs, type GetCostSummaryArgs, type GetInsightsArgs,
  type CheckBudgetArgs, type GetPerformanceProfileArgs, type GetBottlenecksArgs,
  type ExportAnalyticsArgs, type SetRateLimitArgs, type LogResearchOutcomeArgs,
} from "./schemas.js";

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

  private async dispatch(name: string, args: unknown) {
    switch (name) {
      case "log_cost": return await this.handleLogCost(LogCostSchema.parse(args));
      case "get_cost_summary": return await this.handleGetCostSummary(GetCostSummarySchema.parse(args));
      case "get_copilot_performance": return await this.handleGetCopilotPerformance();
      case "get_insights": return await this.handleGetInsights(GetInsightsSchema.parse(args));
      case "check_budget": return await this.handleCheckBudget(CheckBudgetSchema.parse(args));
      case "get_performance_profile": return await this.handleGetPerformanceProfile(GetPerformanceProfileSchema.parse(args));
      case "system_health": return await this.handleSystemHealth();
      case "get_skill_effectiveness": return await this.handleGetSkillEffectiveness();
      case "predict_monthly_cost": return await this.handlePredictMonthlyCost();
      case "get_bottlenecks": return await this.handleGetBottlenecks(GetBottlenecksSchema.parse(args));
      case "export_analytics": return await this.handleExportAnalytics(ExportAnalyticsSchema.parse(args));
      case "set_rate_limit": return await this.handleSetRateLimit(SetRateLimitSchema.parse(args));
      case "get_rate_limit_status": return await this.handleGetRateLimitStatus();
      case "log_research_outcome": return await this.handleLogResearchOutcome(LogResearchOutcomeSchema.parse(args));
      default:
        return respondError(`Unknown tool: ${name}`);
    }
  }

  // =========================================================================
  // Enhanced v1 handlers
  // =========================================================================

  private async handleLogCost(args: LogCostArgs) {
    const { agent, tokens, cost_usd: costUsd, task_description: taskDescription, duration_ms: durationMs } = args;

    const today = new Date().toISOString().split("T")[0];
    const timestamp = new Date().toISOString();

    const entry = {
      date: today,
      agent,
      tokens,
      cost_usd: costUsd,
      task_description: taskDescription,
      timestamp,
    };

    // Write to cost_log table
    this.db.prepare(
      `INSERT INTO cost_log (date, agent, tokens, cost_usd, task_description, timestamp, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(today, agent, tokens, costUsd, taskDescription ?? null, timestamp, durationMs ?? null);

    // Log timing
    if (durationMs !== undefined) {
      this.profiler.logOperation(agent, "api_call", durationMs, true, { tokens, cost_usd: costUsd });
    }

    return respond({
      status: "success",
      operation: "log_cost",
      summary: `Logged $${costUsd.toFixed(4)} for ${agent} (${tokens} tokens)`,
      metadata: { ...entry, duration_ms: durationMs || null },
    });
  }

  private async handleGetCostSummary(args: GetCostSummaryArgs) {
    const period = args.period ?? "today";

    const data = await this.budget.getSpendForPeriod(period);
    const config = this.budget.getConfig();

    return respond({
      status: "success",
      operation: "get_cost_summary",
      summary: `${period}: $${data.total_cost.toFixed(4)} (${data.total_tokens} tokens, ${data.entries.length} operations)`,
      metadata: {
        period,
        total_cost_usd: parseFloat(data.total_cost.toFixed(4)),
        total_tokens: data.total_tokens,
        operation_count: data.entries.length,
        daily_limit: config.daily_limit_usd,
        weekly_limit: config.weekly_limit_usd,
        monthly_limit: config.monthly_limit_usd,
        by_agent: this.groupByAgent(data.entries),
      },
    });
  }

  private groupByAgent(entries: Array<{ agent: string; cost_usd: number; tokens: number }>) {
    const groups: Record<string, { cost: number; tokens: number; count: number }> = {};
    for (const e of entries) {
      if (!groups[e.agent]) groups[e.agent] = { cost: 0, tokens: 0, count: 0 };
      groups[e.agent].cost += e.cost_usd;
      groups[e.agent].tokens += e.tokens;
      groups[e.agent].count++;
    }
    return groups;
  }

  private async handleGetCopilotPerformance() {
    // Read scores from SQLite
    const scores = this.db.prepare(
      `SELECT timestamp, file, skill_file, overall, relevance, correctness, quality, security FROM scores`
    ).all() as Array<{
      timestamp: string; file: string; skill_file: string | null;
      overall: number; relevance: number; correctness: number; quality: number; security: number;
    }>;

    if (scores.length === 0) {
      return respond({
        status: "success",
        operation: "get_copilot_performance",
        summary: "No Copilot scores recorded yet",
        metadata: { total_scored: 0, avg_overall: 0, by_skill: {} },
      });
    }

    const avgOverall = scores.reduce((s, e) => s + e.overall, 0) / scores.length;

    // Group by skill
    const bySkill: Record<string, { count: number; avg_score: number; scores: number[] }> = {};
    for (const s of scores) {
      const key = s.skill_file || "no_skill";
      if (!bySkill[key]) bySkill[key] = { count: 0, avg_score: 0, scores: [] };
      bySkill[key].count++;
      bySkill[key].scores.push(s.overall);
    }
    for (const key of Object.keys(bySkill)) {
      bySkill[key].avg_score = bySkill[key].scores.reduce((a, b) => a + b, 0) / bySkill[key].scores.length;
    }

    return respond({
      status: "success",
      operation: "get_copilot_performance",
      summary: `${scores.length} scored outputs, avg ${avgOverall.toFixed(1)}/100`,
      metadata: {
        total_scored: scores.length,
        avg_overall: parseFloat(avgOverall.toFixed(1)),
        avg_relevance: parseFloat((scores.reduce((s, e) => s + e.relevance, 0) / scores.length).toFixed(1)),
        avg_correctness: parseFloat((scores.reduce((s, e) => s + e.correctness, 0) / scores.length).toFixed(1)),
        avg_quality: parseFloat((scores.reduce((s, e) => s + e.quality, 0) / scores.length).toFixed(1)),
        avg_security: parseFloat((scores.reduce((s, e) => s + e.security, 0) / scores.length).toFixed(1)),
        by_skill: bySkill,
      },
    });
  }

  private async handleGetInsights(args: GetInsightsArgs) {
    const focus = args.focus ?? "all";
    const insights: string[] = [];

    // Cost insights
    if (focus === "all" || focus === "cost") {
      const today = new Date().toISOString().split("T")[0];
      const todaySpend = await this.budget.getSpendForDate(today);
      const config = this.budget.getConfig();
      const pct = (todaySpend / config.daily_limit_usd) * 100;

      if (pct > 80) {
        insights.push(`WARNING: Daily spend at ${pct.toFixed(0)}% of limit ($${todaySpend.toFixed(2)}/$${config.daily_limit_usd})`);
      } else if (pct > 50) {
        insights.push(`Daily spend at ${pct.toFixed(0)}% of limit. Consider batching remaining tasks.`);
      } else {
        insights.push(`Daily budget health: ${pct.toFixed(0)}% used. Plenty of budget remaining.`);
      }
    }

    // Performance insights
    if (focus === "all" || focus === "performance") {
      const bottlenecks = this.profiler.getBottlenecks(2000);
      if (bottlenecks.length > 0) {
        insights.push(`${bottlenecks.length} slow operations detected (>2s avg). Top: ${bottlenecks[0].operation} (${bottlenecks[0].avg_duration_ms.toFixed(0)}ms)`);
      } else {
        insights.push("No performance bottlenecks detected.");
      }
    }

    // Quality insights
    if (focus === "all" || focus === "quality") {
      const scores = this.db.prepare(
        `SELECT overall FROM scores ORDER BY rowid DESC LIMIT 10`
      ).all() as Array<{ overall: number }>;
      if (scores.length > 0) {
        const avgScore = scores.reduce((s, e) => s + e.overall, 0) / scores.length;
        if (avgScore < 50) {
          insights.push(`Quality alert: Recent avg score ${avgScore.toFixed(0)}/100. Review skill files.`);
        } else {
          insights.push(`Quality trend: Recent avg score ${avgScore.toFixed(0)}/100.`);
        }
      } else {
        insights.push("No quality data available. Score outputs with copilot_score to start tracking.");
      }
    }

    return respond({
      status: "success",
      operation: "get_insights",
      summary: `${insights.length} insights generated`,
      metadata: { focus, insights },
    });
  }

  private async handleCheckBudget(args: CheckBudgetArgs) {
    const { estimated_tokens: estimatedTokens, agent, operation } = args;

    const budgetResult = await this.budget.checkBudget(estimatedTokens, agent);

    // Check rate limit if operation specified
    let rateLimit = null;
    if (operation) {
      rateLimit = this.budget.checkRateLimit(operation);
      if (!rateLimit.allowed) {
        return respond({
          status: "rate_limited",
          operation: "check_budget",
          summary: `Rate limited: ${operation} (${rateLimit.window}: ${rateLimit.current}/${rateLimit.limit})`,
          metadata: { budget: budgetResult, rate_limit: rateLimit },
          warnings: [`Rate limit exceeded for ${operation}. Reset at: ${rateLimit.reset_at}`],
        });
      }
    }

    return respond({
      status: budgetResult.allowed ? "success" : "budget_exceeded",
      operation: "check_budget",
      summary: budgetResult.allowed
        ? `Budget OK: $${budgetResult.projected_total.toFixed(4)}/$${budgetResult.daily_limit}`
        : `Budget EXCEEDED: $${budgetResult.projected_total.toFixed(4)}/$${budgetResult.daily_limit}`,
      metadata: { budget: budgetResult, rate_limit: rateLimit },
      ...(budgetResult.warning ? { warnings: [budgetResult.warning] } : {}),
    });
  }

  // =========================================================================
  // New v2 handlers
  // =========================================================================

  private async handleGetPerformanceProfile(args: GetPerformanceProfileArgs) {
    const timeWindow = args.time_window ?? "day";
    const profile = this.profiler.getProfile(timeWindow);

    return respond({
      status: "success",
      operation: "get_performance_profile",
      summary: `${profile.total_operations} operations in last ${timeWindow}, avg ${profile.avg_duration_ms.toFixed(0)}ms`,
      metadata: profile,
    });
  }

  private async handleSystemHealth() {
    const result = await this.health.check();

    return respond({
      status: "success",
      operation: "system_health",
      summary: `System: ${result.overall_status}. ${result.alerts.length} alerts.`,
      metadata: result,
      ...(result.alerts.length > 0 ? { warnings: result.alerts } : {}),
      ...(result.recommendations.length > 0 ? { next_steps: result.recommendations } : {}),
    });
  }

  private async handleGetSkillEffectiveness() {
    const scores = this.db.prepare(
      `SELECT skill_file, overall FROM scores`
    ).all() as Array<{ skill_file: string | null; overall: number }>;

    if (scores.length === 0) {
      return respond({
        status: "success",
        operation: "get_skill_effectiveness",
        summary: "No scoring data. Use copilot_score to start tracking.",
        metadata: { skills: [] },
      });
    }

    const skillScores: Record<string, number[]> = {};
    const noSkillScores: number[] = [];

    for (const s of scores) {
      if (s.skill_file) {
        if (!skillScores[s.skill_file]) skillScores[s.skill_file] = [];
        skillScores[s.skill_file].push(s.overall);
      } else {
        noSkillScores.push(s.overall);
      }
    }

    const avgWithout = noSkillScores.length > 0
      ? noSkillScores.reduce((a, b) => a + b, 0) / noSkillScores.length
      : 0;

    const skills = Object.entries(skillScores).map(([name, vals]) => {
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      const improvement = avgWithout > 0 ? ((avg - avgWithout) / avgWithout) * 100 : 0;
      const effectiveness = avg >= 70 ? "high" : avg >= 50 ? "medium" : avg >= 30 ? "low" : "unknown";

      return {
        name,
        usage_count: vals.length,
        avg_score_when_used: parseFloat(avg.toFixed(1)),
        avg_score_without: parseFloat(avgWithout.toFixed(1)),
        improvement: parseFloat(improvement.toFixed(1)),
        confidence: Math.min(1, vals.length / 10),
        effectiveness,
        recommendation: effectiveness === "high" ? "Keep using" :
          effectiveness === "medium" ? "Consider improving" :
            "Review and update this skill file",
      };
    });

    skills.sort((a, b) => b.avg_score_when_used - a.avg_score_when_used);

    return respond({
      status: "success",
      operation: "get_skill_effectiveness",
      summary: `${skills.length} skills tracked. Best: ${skills[0]?.name || "none"} (${skills[0]?.avg_score_when_used || 0}/100)`,
      metadata: { skills, baseline_avg: parseFloat(avgWithout.toFixed(1)) },
    });
  }

  private async handlePredictMonthlyCost() {
    const allData = await this.budget.getSpendForPeriod("all");
    const config = this.budget.getConfig();

    if (allData.entries.length === 0) {
      return respond({
        status: "success",
        operation: "predict_monthly_cost",
        summary: "No cost data available for prediction",
        metadata: { predicted_usd: 0, confidence: 0, based_on_days: 0 },
      });
    }

    // Group by date
    const dailyCosts: Record<string, number> = {};
    for (const e of allData.entries) {
      dailyCosts[e.date] = (dailyCosts[e.date] || 0) + e.cost_usd;
    }

    const days = Object.keys(dailyCosts).sort();
    const dailyValues = days.map((d) => dailyCosts[d]);

    if (dailyValues.length === 0) {
      return respond({
        status: "success",
        operation: "predict_monthly_cost",
        summary: "Insufficient data for prediction",
        metadata: { predicted_usd: 0, confidence: 0, based_on_days: 0 },
      });
    }

    const avgDaily = dailyValues.reduce((a, b) => a + b, 0) / dailyValues.length;
    const predicted = avgDaily * 30;

    // Calculate trend
    let increasing = false;
    let rateOfChange = 0;
    if (dailyValues.length >= 3) {
      const halfIdx = Math.floor(dailyValues.length / 2);
      const firstHalf = dailyValues.slice(0, halfIdx).reduce((a, b) => a + b, 0) / halfIdx;
      const secondHalf = dailyValues.slice(halfIdx).reduce((a, b) => a + b, 0) / (dailyValues.length - halfIdx);
      increasing = secondHalf > firstHalf;
      rateOfChange = firstHalf > 0 ? ((secondHalf - firstHalf) / firstHalf) * 100 : 0;
    }

    // Confidence based on data points
    const confidence = Math.min(1, dailyValues.length / 14);

    // Range
    const stdDev = Math.sqrt(
      dailyValues.reduce((s, v) => s + Math.pow(v - avgDaily, 2), 0) / dailyValues.length
    );
    const rangeLow = Math.max(0, (avgDaily - stdDev) * 30);
    const rangeHigh = (avgDaily + stdDev) * 30;

    return respond({
      status: "success",
      operation: "predict_monthly_cost",
      summary: `Predicted: $${predicted.toFixed(2)}/month (range: $${rangeLow.toFixed(2)}-$${rangeHigh.toFixed(2)})`,
      metadata: {
        predicted_usd: parseFloat(predicted.toFixed(2)),
        range_low_usd: parseFloat(rangeLow.toFixed(2)),
        range_high_usd: parseFloat(rangeHigh.toFixed(2)),
        confidence: parseFloat(confidence.toFixed(2)),
        based_on_days: dailyValues.length,
        avg_daily: parseFloat(avgDaily.toFixed(4)),
        monthly_limit: config.monthly_limit_usd,
        trends: { increasing, rate_of_change: parseFloat(rateOfChange.toFixed(1)) },
      },
      ...(predicted > config.monthly_limit_usd ? {
        warnings: [`Predicted monthly cost ($${predicted.toFixed(2)}) exceeds monthly limit ($${config.monthly_limit_usd})`],
      } : {}),
    });
  }

  private async handleGetBottlenecks(args: GetBottlenecksArgs) {
    const thresholdMs = args.threshold_ms ?? 1000;
    const bottlenecks = this.profiler.getBottlenecks(thresholdMs);

    return respond({
      status: "success",
      operation: "get_bottlenecks",
      summary: `${bottlenecks.length} operations above ${thresholdMs}ms threshold`,
      metadata: { threshold_ms: thresholdMs, bottlenecks },
    });
  }

  private async handleExportAnalytics(args: ExportAnalyticsArgs) {
    const include = args.include ?? ["costs", "performance", "scores", "health"];
    const exportData: Record<string, any> = {
      exported_at: new Date().toISOString(),
      version: "2.1.0",
    };

    if (include.includes("costs")) {
      try {
        exportData.costs = await this.budget.getSpendForPeriod("all");
      } catch {
        exportData.costs = { error: "Could not read cost data" };
      }
    }

    if (include.includes("performance")) {
      exportData.performance = this.profiler.getProfile("week");
    }

    if (include.includes("scores")) {
      exportData.scores = this.db.prepare(`SELECT * FROM scores`).all();
    }

    if (include.includes("health")) {
      exportData.health = await this.health.check();
    }

    // Save export
    const exportDir = path.join(MEMORY_PATH, "snapshots");
    await fs.mkdir(exportDir, { recursive: true });
    const exportFile = `analytics_export_${Date.now()}.json`;
    const exportPath = path.join(exportDir, exportFile);
    await fs.writeFile(exportPath, JSON.stringify(exportData, null, 2), "utf-8");

    return respond({
      status: "success",
      operation: "export_analytics",
      summary: `Exported ${include.join(", ")} to ${exportFile}`,
      metadata: {
        export_file: path.relative(MEMORY_PATH, exportPath),
        sections: include,
        size_bytes: JSON.stringify(exportData).length,
      },
    });
  }

  private async handleSetRateLimit(args: SetRateLimitArgs) {
    const { operation, per_minute: perMinute, per_hour: perHour, per_day: perDay } = args;

    this.budget.setRateLimit(operation, perMinute, perHour, perDay);

    return respond({
      status: "success",
      operation: "set_rate_limit",
      summary: `Rate limit set for ${operation}`,
      metadata: {
        operation,
        per_minute: perMinute || null,
        per_hour: perHour || null,
        per_day: perDay || null,
      },
    });
  }

  private async handleGetRateLimitStatus() {
    const statuses = this.budget.getRateLimitStatus();

    return respond({
      status: "success",
      operation: "get_rate_limit_status",
      summary: `${statuses.length} rate limits configured`,
      metadata: { rate_limits: statuses },
    });
  }

  // =========================================================================
  // New v2.1 handlers
  // =========================================================================

  private async handleLogResearchOutcome(args: LogResearchOutcomeArgs) {
    const { research_id: researchId, implementation_file: implementationFile, outcome } = args;
    const metrics: Record<string, unknown> = args.metrics ?? {};

    // Load research metadata
    const metadataPath = path.join(
      MEMORY_PATH,
      "research",
      "analyses",
      researchId,
      "metadata.json",
    );

    let metadata: any;
    try {
      const metaRaw = await fs.readFile(metadataPath, "utf-8");
      metadata = JSON.parse(metaRaw);
    } catch {
      return respondError(`Research not found: ${researchId}`);
    }

    // Add outcome
    if (!metadata.outcomes) metadata.outcomes = [];
    metadata.outcomes.push({
      file: implementationFile,
      outcome,
      metrics,
      logged_at: new Date().toISOString(),
    });

    // Update counters
    if (outcome === "success") {
      metadata.validation_count = (metadata.validation_count || 0) + 1;
    } else if (outcome === "failed") {
      metadata.contradiction_count = (metadata.contradiction_count || 0) + 1;
    }

    // Recalculate confidence
    const successes = metadata.outcomes.filter((o: any) => o.outcome === "success").length;
    const failures = metadata.outcomes.filter((o: any) => o.outcome === "failed").length;
    const total = metadata.outcomes.length;
    const successRate = successes / total;
    const failureRate = failures / total;
    metadata.confidence = Math.max(0.1, Math.min(1.0, parseFloat((0.5 + successRate * 0.5 - failureRate * 0.3).toFixed(2))));

    // Save updated metadata
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), "utf-8");

    // Log to research_outcomes table
    this.db.prepare(
      `INSERT INTO research_outcomes (timestamp, research_id, implementation_file, outcome, metrics, confidence_after)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      new Date().toISOString(), researchId, implementationFile, outcome,
      metrics ? JSON.stringify(metrics) : null, metadata.confidence
    );

    return respond({
      status: "success",
      operation: "log_research_outcome",
      summary: `Logged ${outcome} outcome for research "${metadata.title || researchId}"`,
      metadata: {
        research_id: researchId,
        title: metadata.title || researchId,
        new_confidence: metadata.confidence,
        total_outcomes: metadata.outcomes.length,
        success_rate: parseFloat((successes / total).toFixed(2)),
        implementation_file: implementationFile,
        outcome,
        metrics,
      },
    });
  }

  // =========================================================================
  // Server lifecycle
  // =========================================================================

  async run() {
    await fs.mkdir(path.join(MEMORY_PATH, "snapshots"), { recursive: true });
    await fs.mkdir(path.join(MEMORY_PATH, "config"), { recursive: true });

    // Initialize shared SQLite database for analytics data
    this.db = new Database(DB_PATH, { timeout: 5000 });
    this.db.pragma('journal_mode = WAL');
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
