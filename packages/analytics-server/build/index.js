#!/usr/bin/env node
/**
 * Antigravity OS v2.0 - Analytics Server
 * 13 tools + 2 prompts: 5 enhanced from v1 + 8 new tools + 1 new prompt.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, ListPromptsRequestSchema, GetPromptRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs/promises";
import path from "node:path";
import { BudgetEnforcer } from "./budget-enforcer.js";
import { PerformanceProfiler } from "./performance.js";
import { HealthMonitor } from "./health-monitor.js";
// --- Configuration ---
const PROJECT_ROOT = process.env.PROJECT_ROOT || process.cwd();
const MEMORY_DIR = process.env.MEMORY_DIR || ".memory";
const MEMORY_PATH = path.join(PROJECT_ROOT, MEMORY_DIR);
const DB_PATH = path.join(MEMORY_PATH, "antigravity.db");
// --- Helpers ---
function respond(data) {
    return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
}
function respondError(message) {
    return {
        content: [{ type: "text", text: message }],
        isError: true,
    };
}
// --- Server ---
class AnalyticsServer {
    server;
    budget;
    profiler;
    health;
    constructor() {
        this.server = new Server({ name: "antigravity-analytics", version: "2.0.0" }, { capabilities: { tools: {}, prompts: {} } });
        this.budget = new BudgetEnforcer(PROJECT_ROOT);
        this.profiler = new PerformanceProfiler(DB_PATH);
        this.health = new HealthMonitor(PROJECT_ROOT);
        this.setupHandlers();
        this.server.onerror = (error) => {
            console.error("[analytics-server] Error:", error);
        };
    }
    setupHandlers() {
        // --- Tool listing ---
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                // Enhanced v1 tools
                {
                    name: "log_cost",
                    description: "Log an API cost event with operation timing.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            agent: { type: "string", description: "Agent name (e.g. 'antigravity', 'copilot')" },
                            tokens: { type: "number", description: "Token count" },
                            cost_usd: { type: "number", description: "Cost in USD" },
                            task_description: { type: "string", description: "What the task was" },
                            duration_ms: { type: "number", description: "Operation duration in milliseconds" },
                        },
                        required: ["agent", "tokens", "cost_usd", "task_description"],
                    },
                },
                {
                    name: "get_cost_summary",
                    description: "Get cost summary for a period with predictions.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            period: { type: "string", enum: ["today", "week", "month", "all"], description: "Time period" },
                        },
                    },
                },
                {
                    name: "get_copilot_performance",
                    description: "Get Copilot performance stats with skill correlation.",
                    inputSchema: { type: "object", properties: {} },
                },
                {
                    name: "get_insights",
                    description: "Get actionable insights and optimization suggestions.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            focus: { type: "string", enum: ["cost", "quality", "performance", "all"], description: "Insight focus area" },
                        },
                    },
                },
                {
                    name: "check_budget",
                    description: "Check if an operation is within budget with rate limiting.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            estimated_tokens: { type: "number", description: "Estimated token usage" },
                            agent: { type: "string", description: "Agent name" },
                            operation: { type: "string", description: "Operation name (for rate limiting)" },
                        },
                        required: ["estimated_tokens", "agent"],
                    },
                },
                // New v2 tools
                {
                    name: "get_performance_profile",
                    description: "Get operation timing profile with p50/p95/p99 percentiles.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            time_window: { type: "string", enum: ["hour", "day", "week"], description: "Time window (default: day)" },
                        },
                    },
                },
                {
                    name: "system_health",
                    description: "Check system component health (disk, git, index, budget, database).",
                    inputSchema: { type: "object", properties: {} },
                },
                {
                    name: "get_skill_effectiveness",
                    description: "Analyze which skill files produce the best results.",
                    inputSchema: { type: "object", properties: {} },
                },
                {
                    name: "predict_monthly_cost",
                    description: "Predict monthly cost based on recent trends.",
                    inputSchema: { type: "object", properties: {} },
                },
                {
                    name: "get_bottlenecks",
                    description: "Identify slow operations that exceed a duration threshold.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            threshold_ms: { type: "number", description: "Duration threshold in ms (default: 1000)" },
                        },
                    },
                },
                {
                    name: "export_analytics",
                    description: "Export analytics data as JSON.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            include: {
                                type: "array",
                                items: { type: "string", enum: ["costs", "performance", "scores", "health"] },
                                description: "Data to include (default: all)",
                            },
                        },
                    },
                },
                {
                    name: "set_rate_limit",
                    description: "Configure rate limits for an operation.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            operation: { type: "string", description: "Operation name to rate-limit" },
                            per_minute: { type: "number", description: "Max calls per minute" },
                            per_hour: { type: "number", description: "Max calls per hour" },
                            per_day: { type: "number", description: "Max calls per day" },
                        },
                        required: ["operation"],
                    },
                },
                {
                    name: "get_rate_limit_status",
                    description: "Get current rate limit configuration and usage.",
                    inputSchema: { type: "object", properties: {} },
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
                    return {
                        description: "Core Antigravity OS efficiency rules",
                        messages: [{
                                role: "user",
                                content: {
                                    type: "text",
                                    text: [
                                        "# Antigravity OS Efficiency Rules",
                                        "",
                                        "1. **Check memory before starting** — Always read active context first",
                                        "2. **Log decisions immediately** — Use memory_log_decision for architecture choices",
                                        "3. **Log lessons as they happen** — Use memory_log_lesson for bugs and patterns",
                                        "4. **Monitor costs** — Check budget before expensive operations",
                                        "5. **Use skill files** — Build reusable prompts, don't repeat specs",
                                        "6. **Detect loops** — Stop after 3 failures and analyze",
                                        "7. **Batch operations** — Use batch_execute for related tasks",
                                        "8. **Cache responses** — Reuse validated results",
                                        "9. **Review health** — Run system_health periodically",
                                        "10. **Export analytics** — Track trends with export_analytics",
                                    ].join("\n"),
                                },
                            }],
                    };
                case "cost_awareness":
                    return {
                        description: "Budget awareness and cost optimization",
                        messages: [{
                                role: "user",
                                content: {
                                    type: "text",
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
            const start = performance.now();
            try {
                const result = await this.dispatch(name, args);
                const duration = performance.now() - start;
                this.profiler.logOperation("analytics-server", name, duration, true);
                return result;
            }
            catch (error) {
                const duration = performance.now() - start;
                this.profiler.logOperation("analytics-server", name, duration, false, { error: error.message });
                return respondError(`Error: ${error.message}`);
            }
        });
    }
    async dispatch(name, args) {
        switch (name) {
            case "log_cost": return await this.handleLogCost(args);
            case "get_cost_summary": return await this.handleGetCostSummary(args);
            case "get_copilot_performance": return await this.handleGetCopilotPerformance();
            case "get_insights": return await this.handleGetInsights(args);
            case "check_budget": return await this.handleCheckBudget(args);
            case "get_performance_profile": return await this.handleGetPerformanceProfile(args);
            case "system_health": return await this.handleSystemHealth();
            case "get_skill_effectiveness": return await this.handleGetSkillEffectiveness();
            case "predict_monthly_cost": return await this.handlePredictMonthlyCost();
            case "get_bottlenecks": return await this.handleGetBottlenecks(args);
            case "export_analytics": return await this.handleExportAnalytics(args);
            case "set_rate_limit": return await this.handleSetRateLimit(args);
            case "get_rate_limit_status": return await this.handleGetRateLimitStatus();
            default:
                return respondError(`Unknown tool: ${name}`);
        }
    }
    // =========================================================================
    // Enhanced v1 handlers
    // =========================================================================
    async handleLogCost(args) {
        const agent = args.agent;
        const tokens = args.tokens;
        const costUsd = args.cost_usd;
        const taskDescription = args.task_description;
        const durationMs = args.duration_ms;
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
        // Write to costs.jsonl
        const costLogPath = path.join(MEMORY_PATH, "snapshots", "costs.jsonl");
        await fs.mkdir(path.dirname(costLogPath), { recursive: true });
        await fs.appendFile(costLogPath, JSON.stringify(entry) + "\n");
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
    async handleGetCostSummary(args) {
        const period = args?.period || "today";
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
    groupByAgent(entries) {
        const groups = {};
        for (const e of entries) {
            if (!groups[e.agent])
                groups[e.agent] = { cost: 0, tokens: 0, count: 0 };
            groups[e.agent].cost += e.cost_usd;
            groups[e.agent].tokens += e.tokens;
            groups[e.agent].count++;
        }
        return groups;
    }
    async handleGetCopilotPerformance() {
        // Read scores log
        const scoresPath = path.join(MEMORY_PATH, "snapshots", "scores.jsonl");
        let scores = [];
        try {
            const data = await fs.readFile(scoresPath, "utf-8");
            scores = data.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
        }
        catch { /* no scores yet */ }
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
        const bySkill = {};
        for (const s of scores) {
            const key = s.skill_file || "no_skill";
            if (!bySkill[key])
                bySkill[key] = { count: 0, avg_score: 0, scores: [] };
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
    async handleGetInsights(args) {
        const focus = args?.focus || "all";
        const insights = [];
        // Cost insights
        if (focus === "all" || focus === "cost") {
            const today = new Date().toISOString().split("T")[0];
            const todaySpend = await this.budget.getSpendForDate(today);
            const config = this.budget.getConfig();
            const pct = (todaySpend / config.daily_limit_usd) * 100;
            if (pct > 80) {
                insights.push(`WARNING: Daily spend at ${pct.toFixed(0)}% of limit ($${todaySpend.toFixed(2)}/$${config.daily_limit_usd})`);
            }
            else if (pct > 50) {
                insights.push(`Daily spend at ${pct.toFixed(0)}% of limit. Consider batching remaining tasks.`);
            }
            else {
                insights.push(`Daily budget health: ${pct.toFixed(0)}% used. Plenty of budget remaining.`);
            }
        }
        // Performance insights
        if (focus === "all" || focus === "performance") {
            const bottlenecks = this.profiler.getBottlenecks(2000);
            if (bottlenecks.length > 0) {
                insights.push(`${bottlenecks.length} slow operations detected (>2s avg). Top: ${bottlenecks[0].operation} (${bottlenecks[0].avg_duration_ms.toFixed(0)}ms)`);
            }
            else {
                insights.push("No performance bottlenecks detected.");
            }
        }
        // Quality insights
        if (focus === "all" || focus === "quality") {
            const scoresPath = path.join(MEMORY_PATH, "snapshots", "scores.jsonl");
            try {
                const data = await fs.readFile(scoresPath, "utf-8");
                const scores = data.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
                if (scores.length > 0) {
                    const recent = scores.slice(-10);
                    const avgScore = recent.reduce((s, e) => s + e.overall, 0) / recent.length;
                    if (avgScore < 50) {
                        insights.push(`Quality alert: Recent avg score ${avgScore.toFixed(0)}/100. Review skill files.`);
                    }
                    else {
                        insights.push(`Quality trend: Recent avg score ${avgScore.toFixed(0)}/100.`);
                    }
                }
            }
            catch {
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
    async handleCheckBudget(args) {
        const estimatedTokens = args.estimated_tokens;
        const agent = args.agent;
        const operation = args.operation;
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
    async handleGetPerformanceProfile(args) {
        const timeWindow = args?.time_window || "day";
        const profile = this.profiler.getProfile(timeWindow);
        return respond({
            status: "success",
            operation: "get_performance_profile",
            summary: `${profile.total_operations} operations in last ${timeWindow}, avg ${profile.avg_duration_ms.toFixed(0)}ms`,
            metadata: profile,
        });
    }
    async handleSystemHealth() {
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
    async handleGetSkillEffectiveness() {
        const scoresPath = path.join(MEMORY_PATH, "snapshots", "scores.jsonl");
        let scores = [];
        try {
            const data = await fs.readFile(scoresPath, "utf-8");
            scores = data.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
        }
        catch { /* no scores */ }
        if (scores.length === 0) {
            return respond({
                status: "success",
                operation: "get_skill_effectiveness",
                summary: "No scoring data. Use copilot_score to start tracking.",
                metadata: { skills: [] },
            });
        }
        const skillScores = {};
        const noSkillScores = [];
        for (const s of scores) {
            if (s.skill_file) {
                if (!skillScores[s.skill_file])
                    skillScores[s.skill_file] = [];
                skillScores[s.skill_file].push(s.overall);
            }
            else {
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
    async handlePredictMonthlyCost() {
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
        const dailyCosts = {};
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
        const stdDev = Math.sqrt(dailyValues.reduce((s, v) => s + Math.pow(v - avgDaily, 2), 0) / dailyValues.length);
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
    async handleGetBottlenecks(args) {
        const thresholdMs = args?.threshold_ms || 1000;
        const bottlenecks = this.profiler.getBottlenecks(thresholdMs);
        return respond({
            status: "success",
            operation: "get_bottlenecks",
            summary: `${bottlenecks.length} operations above ${thresholdMs}ms threshold`,
            metadata: { threshold_ms: thresholdMs, bottlenecks },
        });
    }
    async handleExportAnalytics(args) {
        const include = args?.include || ["costs", "performance", "scores", "health"];
        const exportData = {
            exported_at: new Date().toISOString(),
            version: "2.0.0",
        };
        if (include.includes("costs")) {
            try {
                exportData.costs = await this.budget.getSpendForPeriod("all");
            }
            catch {
                exportData.costs = { error: "Could not read cost data" };
            }
        }
        if (include.includes("performance")) {
            exportData.performance = this.profiler.getProfile("week");
        }
        if (include.includes("scores")) {
            const scoresPath = path.join(MEMORY_PATH, "snapshots", "scores.jsonl");
            try {
                const data = await fs.readFile(scoresPath, "utf-8");
                exportData.scores = data.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
            }
            catch {
                exportData.scores = [];
            }
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
    async handleSetRateLimit(args) {
        const operation = args.operation;
        const perMinute = args.per_minute;
        const perHour = args.per_hour;
        const perDay = args.per_day;
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
    async handleGetRateLimitStatus() {
        const statuses = this.budget.getRateLimitStatus();
        return respond({
            status: "success",
            operation: "get_rate_limit_status",
            summary: `${statuses.length} rate limits configured`,
            metadata: { rate_limits: statuses },
        });
    }
    // =========================================================================
    // Server lifecycle
    // =========================================================================
    async run() {
        await fs.mkdir(path.join(MEMORY_PATH, "snapshots"), { recursive: true });
        await fs.mkdir(path.join(MEMORY_PATH, "config"), { recursive: true });
        await this.budget.loadConfig();
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error("[analytics-server] v2.0.0 Running on stdio (13 tools + 2 prompts)");
    }
}
const server = new AnalyticsServer();
server.run().catch(console.error);
