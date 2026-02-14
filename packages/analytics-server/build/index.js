#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, ListPromptsRequestSchema, GetPromptRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs/promises";
import path from "node:path";
import { BudgetEnforcer } from "./budget-enforcer.js";
// --- Configuration ---
const PROJECT_ROOT = process.env.PROJECT_ROOT || process.cwd();
const MEMORY_PATH = path.join(PROJECT_ROOT, process.env.MEMORY_DIR || ".memory");
// --- Server ---
class AnalyticsServer {
    server;
    budget;
    constructor() {
        this.server = new Server({ name: "antigravity-analytics", version: "1.0.0" }, { capabilities: { tools: {}, prompts: {} } });
        this.budget = new BudgetEnforcer(PROJECT_ROOT);
        this.setupToolHandlers();
        this.setupPromptHandlers();
        this.server.onerror = (error) => {
            console.error("[analytics-server] Error:", error);
        };
    }
    setupPromptHandlers() {
        this.server.setRequestHandler(ListPromptsRequestSchema, async () => ({
            prompts: [
                {
                    name: "efficiency_rules",
                    description: "Token optimization guidelines for AI sessions",
                },
            ],
        }));
        this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
            if (request.params.name === "efficiency_rules") {
                return {
                    messages: [
                        {
                            role: "user",
                            content: {
                                type: "text",
                                text: `EFFICIENCY RULES FOR THIS SESSION:
1. Always check budget before expensive operations (check_budget tool)
2. Log costs for all Antigravity interactions (log_cost tool)
3. Review cost_summary periodically to stay within budget
4. Use Copilot (free) for bulk code generation, Antigravity for decisions only
5. If daily budget is >80% spent, switch to Copilot-only mode

Token budget awareness: User pays per token for Antigravity outputs. Be concise.`,
                            },
                        },
                    ],
                };
            }
            throw new Error(`Unknown prompt: ${request.params.name}`);
        });
    }
    setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: "log_cost",
                    description: "Log token usage and cost for an AI interaction. Antigravity costs $0.015/1K tokens, Copilot is free.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            agent: {
                                type: "string",
                                enum: ["antigravity", "copilot"],
                                description: "Which AI agent was used",
                            },
                            tokens: {
                                type: "number",
                                description: "Number of tokens used",
                            },
                            task_description: {
                                type: "string",
                                description: "Brief description of what was done",
                            },
                        },
                        required: ["agent", "tokens", "task_description"],
                    },
                },
                {
                    name: "get_cost_summary",
                    description: "Get aggregated cost summary for a time period, broken down by agent.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            period: {
                                type: "string",
                                enum: ["today", "week", "month", "all"],
                                description: 'Time period (default: "today")',
                            },
                        },
                    },
                },
                {
                    name: "get_copilot_performance",
                    description: "Get Copilot interaction performance metrics (average score, success rate).",
                    inputSchema: {
                        type: "object",
                        properties: {
                            group_by: {
                                type: "string",
                                enum: ["template", "complexity", "overall"],
                                description: 'How to group results (default: "overall")',
                            },
                        },
                    },
                },
                {
                    name: "get_insights",
                    description: "Analyze cost and performance data to identify optimization opportunities.",
                    inputSchema: {
                        type: "object",
                        properties: {},
                    },
                },
                {
                    name: "check_budget",
                    description: "Check if budget allows an operation. Returns error if budget would be exceeded.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            estimated_tokens: {
                                type: "number",
                                description: "Estimated tokens for this operation",
                            },
                            agent: {
                                type: "string",
                                enum: ["antigravity", "copilot"],
                                description: "Which agent will be used",
                            },
                        },
                        required: ["estimated_tokens", "agent"],
                    },
                },
            ],
        }));
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            try {
                switch (name) {
                    case "log_cost":
                        return await this.handleLogCost(args);
                    case "get_cost_summary":
                        return await this.handleCostSummary(args);
                    case "get_copilot_performance":
                        return await this.handlePerformance(args);
                    case "get_insights":
                        return await this.handleInsights();
                    case "check_budget":
                        return await this.handleCheckBudget(args);
                    default:
                        return {
                            content: [{ type: "text", text: `Unknown tool: ${name}` }],
                            isError: true,
                        };
                }
            }
            catch (error) {
                return {
                    content: [{ type: "text", text: `Error: ${error.message}` }],
                    isError: true,
                };
            }
        });
    }
    // --- Tool Handlers ---
    async handleLogCost(args) {
        const { agent, tokens, task_description } = args;
        const config = this.budget.getConfig();
        const costPerToken = agent === "antigravity" ? config.costs.antigravity_input : config.costs.copilot;
        const costUsd = (tokens / 1000) * costPerToken;
        const entry = {
            timestamp: new Date().toISOString(),
            date: new Date().toISOString().split("T")[0],
            agent,
            tokens,
            cost_usd: costUsd,
            task_description,
        };
        const costsFile = path.join(MEMORY_PATH, "snapshots", "costs.jsonl");
        await fs.mkdir(path.dirname(costsFile), { recursive: true });
        await fs.appendFile(costsFile, JSON.stringify(entry) + "\n");
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: true,
                        agent,
                        tokens,
                        cost_usd: costUsd.toFixed(4),
                        logged_to: "snapshots/costs.jsonl",
                    }),
                },
            ],
        };
    }
    async handleCostSummary(args) {
        const period = args?.period || "today";
        await this.budget.loadConfig();
        const data = await this.budget.getSpendForPeriod(period);
        // Group by agent
        const byAgent = {};
        for (const entry of data.entries) {
            if (!byAgent[entry.agent]) {
                byAgent[entry.agent] = { tokens: 0, cost: 0, count: 0 };
            }
            byAgent[entry.agent].tokens += entry.tokens;
            byAgent[entry.agent].cost += entry.cost_usd;
            byAgent[entry.agent].count += 1;
        }
        const config = this.budget.getConfig();
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        period,
                        total_cost_usd: data.total_cost.toFixed(4),
                        total_tokens: data.total_tokens,
                        total_interactions: data.entries.length,
                        by_agent: Object.fromEntries(Object.entries(byAgent).map(([agent, stats]) => [
                            agent,
                            {
                                tokens: stats.tokens,
                                cost_usd: stats.cost.toFixed(4),
                                interactions: stats.count,
                                avg_tokens_per_interaction: stats.count
                                    ? Math.round(stats.tokens / stats.count)
                                    : 0,
                            },
                        ])),
                        budget: {
                            daily_limit: config.daily_limit_usd,
                            weekly_limit: config.weekly_limit_usd,
                            monthly_limit: config.monthly_limit_usd,
                        },
                    }, null, 2),
                },
            ],
        };
    }
    async handlePerformance(args) {
        const groupBy = args?.group_by || "overall";
        const scoresFile = path.join(MEMORY_PATH, "snapshots", "prompt_scores.jsonl");
        let entries;
        try {
            const content = await fs.readFile(scoresFile, "utf-8");
            entries = content
                .trim()
                .split("\n")
                .filter(Boolean)
                .map((l) => JSON.parse(l));
        }
        catch {
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            message: "No performance data yet. Use copilot_score to log interactions.",
                            total_interactions: 0,
                        }),
                    },
                ],
            };
        }
        if (groupBy === "overall") {
            const avgScore = entries.reduce((sum, e) => sum + e.score, 0) / entries.length;
            const successRate = entries.filter((e) => e.score >= 4).length / entries.length;
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            group_by: "overall",
                            total_interactions: entries.length,
                            average_score: avgScore.toFixed(2),
                            success_rate: (successRate * 100).toFixed(1) + "%",
                            score_distribution: {
                                "5_perfect": entries.filter((e) => e.score === 5).length,
                                "4_good": entries.filter((e) => e.score === 4).length,
                                "3_ok": entries.filter((e) => e.score === 3).length,
                                "2_poor": entries.filter((e) => e.score === 2).length,
                                "1_fail": entries.filter((e) => e.score === 1).length,
                            },
                        }, null, 2),
                    },
                ],
            };
        }
        if (groupBy === "template") {
            const groups = {};
            for (const entry of entries) {
                const key = entry.template || "unknown";
                if (!groups[key])
                    groups[key] = { scores: [], count: 0 };
                groups[key].scores.push(entry.score);
                groups[key].count++;
            }
            const templateStats = Object.fromEntries(Object.entries(groups).map(([template, data]) => {
                const avg = data.scores.reduce((a, b) => a + b, 0) / data.count;
                const successRate = data.scores.filter((s) => s >= 4).length / data.count;
                return [
                    template,
                    {
                        interactions: data.count,
                        average_score: avg.toFixed(2),
                        success_rate: (successRate * 100).toFixed(1) + "%",
                    },
                ];
            }));
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({ group_by: "template", templates: templateStats }, null, 2),
                    },
                ],
            };
        }
        // Default: return all entries summary
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({ total_interactions: entries.length, group_by: groupBy }, null, 2),
                },
            ],
        };
    }
    async handleInsights() {
        const insights = [];
        // Analyze costs
        try {
            const costData = await this.budget.getSpendForPeriod("week");
            const totalWeekCost = costData.total_cost;
            if (totalWeekCost === 0) {
                insights.push("No cost data this week. Start logging costs with log_cost to track spending.");
            }
            else {
                const config = this.budget.getConfig();
                const weeklyUsage = totalWeekCost / config.weekly_limit_usd;
                if (weeklyUsage > 0.8) {
                    insights.push(`HIGH SPEND: Weekly spending at ${(weeklyUsage * 100).toFixed(0)}% of limit. Consider using Copilot more for code generation.`);
                }
                else if (weeklyUsage < 0.2) {
                    insights.push(`LOW USAGE: Only ${(weeklyUsage * 100).toFixed(0)}% of weekly budget used. You have capacity for more Antigravity-driven tasks.`);
                }
                // Check Copilot vs Antigravity ratio
                const byAgent = {};
                for (const entry of costData.entries) {
                    byAgent[entry.agent] = (byAgent[entry.agent] || 0) + 1;
                }
                const agTotal = byAgent["antigravity"] || 0;
                const copTotal = byAgent["copilot"] || 0;
                const total = agTotal + copTotal;
                if (total > 5 && agTotal / total > 0.7) {
                    insights.push(`Antigravity is doing ${((agTotal / total) * 100).toFixed(0)}% of work. Delegate more code generation to Copilot to save tokens.`);
                }
            }
        }
        catch {
            insights.push("Unable to analyze cost data.");
        }
        // Analyze performance
        try {
            const scoresFile = path.join(MEMORY_PATH, "snapshots", "prompt_scores.jsonl");
            const content = await fs.readFile(scoresFile, "utf-8");
            const entries = content
                .trim()
                .split("\n")
                .filter(Boolean)
                .map((l) => JSON.parse(l));
            if (entries.length >= 5) {
                const avgScore = entries.reduce((sum, e) => sum + e.score, 0) / entries.length;
                const successRate = entries.filter((e) => e.score >= 4).length / entries.length;
                if (avgScore < 3) {
                    insights.push(`LOW QUALITY: Average Copilot score is ${avgScore.toFixed(1)}/5. Review and update .skills/copilot_mastery.md with better prompting techniques.`);
                }
                if (successRate < 0.7) {
                    insights.push(`LOW SUCCESS RATE: Only ${(successRate * 100).toFixed(0)}% of Copilot outputs are acceptable. Consider adding more context to prompts or updating templates.`);
                }
                // Check for common failed issues
                const failedEntries = entries.filter((e) => e.score < 4 && e.issues);
                if (failedEntries.length > 0) {
                    const issueWords = failedEntries
                        .map((e) => e.issues)
                        .join(" ")
                        .toLowerCase();
                    if (issueWords.includes("type") || issueWords.includes("typing")) {
                        insights.push("RECURRING ISSUE: Type-related failures detected. Add type hint requirements to prompt templates.");
                    }
                    if (issueWords.includes("edge case") || issueWords.includes("error")) {
                        insights.push("RECURRING ISSUE: Edge case handling failures. Add explicit edge case lists to prompts.");
                    }
                }
                // Recent trend
                const recent = entries.slice(-5);
                const recentAvg = recent.reduce((sum, e) => sum + e.score, 0) / recent.length;
                if (recentAvg < avgScore - 0.5) {
                    insights.push(`DECLINING TREND: Recent scores (${recentAvg.toFixed(1)}) are lower than average (${avgScore.toFixed(1)}). Check if prompts need updating.`);
                }
                else if (recentAvg > avgScore + 0.5) {
                    insights.push(`IMPROVING TREND: Recent scores (${recentAvg.toFixed(1)}) are higher than average (${avgScore.toFixed(1)}). Current approach is working well.`);
                }
            }
            else {
                insights.push(`Only ${entries.length} scored interactions so far. Need at least 5 for meaningful insights.`);
            }
        }
        catch {
            insights.push("No performance data yet. Score Copilot interactions with copilot_score to track quality.");
        }
        if (insights.length === 0) {
            insights.push("Insufficient data for insights. Keep logging costs and scoring interactions.");
        }
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({ insights, generated_at: new Date().toISOString() }, null, 2),
                },
            ],
        };
    }
    async handleCheckBudget(args) {
        const { estimated_tokens, agent } = args;
        await this.budget.loadConfig();
        const result = await this.budget.checkBudget(estimated_tokens, agent);
        if (!result.allowed) {
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            ...result,
                            allowed: false,
                            today_spend: result.today_spend.toFixed(4),
                            operation_cost: result.operation_cost.toFixed(4),
                            projected_total: result.projected_total.toFixed(4),
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        allowed: true,
                        today_spend: result.today_spend.toFixed(4),
                        operation_cost: result.operation_cost.toFixed(4),
                        projected_total: result.projected_total.toFixed(4),
                        daily_limit: result.daily_limit,
                        warning: result.warning || null,
                    }, null, 2),
                },
            ],
        };
    }
    async run() {
        await fs.mkdir(path.join(MEMORY_PATH, "snapshots"), { recursive: true });
        await fs.mkdir(path.join(MEMORY_PATH, "config"), { recursive: true });
        await this.budget.loadConfig();
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error("[analytics-server] Running on stdio");
    }
}
const server = new AnalyticsServer();
server.run().catch(console.error);
