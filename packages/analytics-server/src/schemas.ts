/**
 * Antigravity OS v2.1 - Analytics Server Zod Schemas
 * Single source of truth for tool input validation and JSON schema generation.
 */

import { z } from "zod";

// --- Tool Schemas ---

export const LogCostSchema = z.object({
  agent: z.string().describe("Agent name (e.g. 'antigravity', 'copilot')"),
  tokens: z.number().describe("Token count"),
  cost_usd: z.number().describe("Cost in USD"),
  task_description: z.string().describe("What the task was"),
  duration_ms: z.number().optional().describe("Operation duration in milliseconds"),
});

export const GetCostSummarySchema = z.object({
  period: z.enum(["today", "week", "month", "all"]).optional().describe("Time period"),
});

export const GetInsightsSchema = z.object({
  focus: z.enum(["cost", "quality", "performance", "all"]).optional().describe("Insight focus area"),
});

export const CheckBudgetSchema = z.object({
  estimated_tokens: z.number().describe("Estimated token usage"),
  agent: z.string().describe("Agent name"),
  operation: z.string().optional().describe("Operation name (for rate limiting)"),
});

export const GetPerformanceProfileSchema = z.object({
  time_window: z.enum(["hour", "day", "week"]).optional().describe("Time window (default: day)"),
});

export const GetBottlenecksSchema = z.object({
  threshold_ms: z.number().optional().describe("Duration threshold in ms (default: 1000)"),
});

export const ExportAnalyticsSchema = z.object({
  include: z.array(z.enum(["costs", "performance", "scores", "health"])).optional().describe("Data to include (default: all)"),
});

export const SetRateLimitSchema = z.object({
  operation: z.string().describe("Operation name to rate-limit"),
  per_minute: z.number().optional().describe("Max calls per minute"),
  per_hour: z.number().optional().describe("Max calls per hour"),
  per_day: z.number().optional().describe("Max calls per day"),
});

export const LogResearchOutcomeSchema = z.object({
  research_id: z.string().describe("Research ID"),
  implementation_file: z.string().describe("File that was implemented"),
  outcome: z.enum(["success", "partial", "failed"]).describe("How well research predictions matched reality"),
  metrics: z.object({
    expected_sharpe: z.number().optional(),
    actual_sharpe: z.number().optional(),
    expected_drawdown: z.number().optional(),
    actual_drawdown: z.number().optional(),
    notes: z.string().optional(),
  }).optional().describe("Performance metrics comparing expected vs actual"),
});

// --- Types inferred from schemas ---

export type LogCostArgs = z.infer<typeof LogCostSchema>;
export type GetCostSummaryArgs = z.infer<typeof GetCostSummarySchema>;
export type GetInsightsArgs = z.infer<typeof GetInsightsSchema>;
export type CheckBudgetArgs = z.infer<typeof CheckBudgetSchema>;
export type GetPerformanceProfileArgs = z.infer<typeof GetPerformanceProfileSchema>;
export type GetBottlenecksArgs = z.infer<typeof GetBottlenecksSchema>;
export type ExportAnalyticsArgs = z.infer<typeof ExportAnalyticsSchema>;
export type SetRateLimitArgs = z.infer<typeof SetRateLimitSchema>;
export type LogResearchOutcomeArgs = z.infer<typeof LogResearchOutcomeSchema>;

export const SetBudgetOverrideSchema = z.object({
  reason: z.string().describe("Reason for budget override (e.g., 'critical rollback in progress')"),
  multiplier: z.number().min(1).max(5).optional().describe("Budget limit multiplier (default: 2, max: 5)"),
  duration_minutes: z.number().int().min(5).max(480).optional().describe("Override duration in minutes (default: 60, max: 480)"),
});
export type SetBudgetOverrideArgs = z.infer<typeof SetBudgetOverrideSchema>;

// --- JSON Schema generation helper ---

function toJsonSchema(schema: z.ZodType, required?: string[]) {
  const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
  delete jsonSchema.$schema;
  if (required) {
    jsonSchema.required = required;
  }
  return jsonSchema;
}

// --- Tool definitions using Zod schemas ---

export function getAnalyticsToolDefinitions() {
  return [
    {
      name: "log_cost",
      description: "Log an API cost event with operation timing. Returns: { status, summary, metadata: { date, agent, tokens, cost_usd, timestamp, duration_ms } }",
      inputSchema: toJsonSchema(LogCostSchema, ["agent", "tokens", "cost_usd", "task_description"]),
    },
    {
      name: "get_cost_summary",
      description: "Get cost summary for a period. Returns: { status, summary, metadata: { period, total_cost_usd, total_tokens, operation_count, daily_limit, by_agent } }",
      inputSchema: toJsonSchema(GetCostSummarySchema),
    },
    {
      name: "get_copilot_performance",
      description: "Get Copilot performance stats with skill correlation. Returns: { status, summary, metadata: { total_scored, avg_overall, avg_relevance, avg_correctness, avg_quality, avg_security, by_skill } }",
      inputSchema: { type: "object" as const, properties: {} },
    },
    {
      name: "get_insights",
      description: "Get actionable insights and optimization suggestions. Returns: { status, summary, metadata: { focus, insights: string[] } }",
      inputSchema: toJsonSchema(GetInsightsSchema),
    },
    {
      name: "check_budget",
      description: "Check if an operation is within budget with rate limiting. Returns: { status: 'success'|'budget_exceeded'|'rate_limited', metadata: { budget: { allowed, today_spend, operation_cost, projected_total, daily_limit }, rate_limit } }",
      inputSchema: toJsonSchema(CheckBudgetSchema, ["estimated_tokens", "agent"]),
    },
    {
      name: "get_performance_profile",
      description: "Get operation timing profile with p50/p95/p99 percentiles. Returns: { status, metadata: { total_operations, avg_duration_ms, operations: OperationProfile[] } }",
      inputSchema: toJsonSchema(GetPerformanceProfileSchema),
    },
    {
      name: "system_health",
      description: "Check system component health (disk, git, index, budget, database). Returns: { status, metadata: { overall_status: 'healthy'|'degraded'|'unhealthy', components, alerts, recommendations } }",
      inputSchema: { type: "object" as const, properties: {} },
    },
    {
      name: "get_skill_effectiveness",
      description: "Analyze which skill files produce the best results. Returns: { status, metadata: { skills: Array<{ name, usage_count, avg_score_when_used, effectiveness }>, baseline_avg } }",
      inputSchema: { type: "object" as const, properties: {} },
    },
    {
      name: "predict_monthly_cost",
      description: "Predict monthly cost based on recent trends. Returns: { status, metadata: { predicted_usd, range_low_usd, range_high_usd, confidence, trends: { increasing, rate_of_change } } }",
      inputSchema: { type: "object" as const, properties: {} },
    },
    {
      name: "get_bottlenecks",
      description: "Identify slow operations exceeding a duration threshold. Returns: { status, metadata: { threshold_ms, bottlenecks: Array<{ operation, avg_duration_ms, occurrences, impact }> } }",
      inputSchema: toJsonSchema(GetBottlenecksSchema),
    },
    {
      name: "export_analytics",
      description: "Export analytics data as JSON. Returns: { status, metadata: { export_file, sections, size_bytes } }",
      inputSchema: toJsonSchema(ExportAnalyticsSchema),
    },
    {
      name: "set_rate_limit",
      description: "Configure rate limits for an operation. Returns: { status, metadata: { operation, per_minute, per_hour, per_day } }",
      inputSchema: toJsonSchema(SetRateLimitSchema, ["operation"]),
    },
    {
      name: "get_rate_limit_status",
      description: "Get current rate limit configuration and usage. Returns: { status, metadata: { rate_limits: Array<{ operation, per_minute?, per_hour?, per_day? }> } }",
      inputSchema: { type: "object" as const, properties: {} },
    },
    {
      name: "log_research_outcome",
      description: "Log whether research-based implementation worked in practice. Updates research confidence based on real-world outcomes.",
      inputSchema: toJsonSchema(LogResearchOutcomeSchema, ["research_id", "implementation_file", "outcome"]),
    },
    {
      name: "set_budget_override",
      description: "Temporarily increase budget limits for critical operations (e.g., rollbacks, hotfixes). Auto-expires after duration. Multiplier applies to daily/weekly/monthly limits.",
      inputSchema: toJsonSchema(SetBudgetOverrideSchema, ["reason"]),
    },
  ];
}
