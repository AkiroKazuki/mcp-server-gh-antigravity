import { respond, respondError } from "@antigravity-os/shared";
import type { AnalyticsContext } from "./types.js";
import type { LogCostArgs, GetCostSummaryArgs, CheckBudgetArgs, SetRateLimitArgs } from "../schemas.js";

function groupByAgent(entries: Array<{ agent: string; cost_usd: number; tokens: number }>) {
  const groups: Record<string, { cost: number; tokens: number; count: number }> = {};
  for (const e of entries) {
    if (!groups[e.agent]) groups[e.agent] = { cost: 0, tokens: 0, count: 0 };
    groups[e.agent].cost += e.cost_usd;
    groups[e.agent].tokens += e.tokens;
    groups[e.agent].count++;
  }
  return groups;
}

export async function handleLogCost(ctx: AnalyticsContext, args: LogCostArgs) {
  const { agent, tokens, cost_usd: costUsd, task_description: taskDescription, duration_ms: durationMs } = args;

  const today = new Date().toISOString().split("T")[0];
  const timestamp = new Date().toISOString();

  const entry = { date: today, agent, tokens, cost_usd: costUsd, task_description: taskDescription, timestamp };

  ctx.db.prepare(
    `INSERT INTO cost_log (date, agent, tokens, cost_usd, task_description, timestamp, duration_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(today, agent, tokens, costUsd, taskDescription ?? null, timestamp, durationMs ?? null);

  if (durationMs !== undefined) {
    ctx.profiler.logOperation(agent, "api_call", durationMs, true, { tokens, cost_usd: costUsd });
  }

  return respond({
    status: "success",
    operation: "log_cost",
    summary: `Logged $${costUsd.toFixed(4)} for ${agent} (${tokens} tokens)`,
    metadata: { ...entry, duration_ms: durationMs || null },
  });
}

export async function handleGetCostSummary(ctx: AnalyticsContext, args: GetCostSummaryArgs) {
  const period = args.period ?? "today";
  const data = await ctx.budget.getSpendForPeriod(period);
  const config = ctx.budget.getConfig();

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
      by_agent: groupByAgent(data.entries),
    },
  });
}

export async function handleCheckBudget(ctx: AnalyticsContext, args: CheckBudgetArgs) {
  const { estimated_tokens: estimatedTokens, agent, operation } = args;
  const budgetResult = await ctx.budget.checkBudget(estimatedTokens, agent);

  let rateLimit = null;
  if (operation) {
    rateLimit = ctx.budget.checkRateLimit(operation);
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

export async function handlePredictMonthlyCost(ctx: AnalyticsContext) {
  const allData = await ctx.budget.getSpendForPeriod("all");
  const config = ctx.budget.getConfig();

  if (allData.entries.length === 0) {
    return respond({
      status: "success",
      operation: "predict_monthly_cost",
      summary: "No cost data available for prediction",
      metadata: { predicted_usd: 0, confidence: 0, based_on_days: 0 },
    });
  }

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

  let increasing = false;
  let rateOfChange = 0;
  if (dailyValues.length >= 3) {
    const halfIdx = Math.floor(dailyValues.length / 2);
    const firstHalf = dailyValues.slice(0, halfIdx).reduce((a, b) => a + b, 0) / halfIdx;
    const secondHalf = dailyValues.slice(halfIdx).reduce((a, b) => a + b, 0) / (dailyValues.length - halfIdx);
    increasing = secondHalf > firstHalf;
    rateOfChange = firstHalf > 0 ? ((secondHalf - firstHalf) / firstHalf) * 100 : 0;
  }

  const confidence = Math.min(1, dailyValues.length / 14);
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

export async function handleSetRateLimit(ctx: AnalyticsContext, args: SetRateLimitArgs) {
  const { operation, per_minute: perMinute, per_hour: perHour, per_day: perDay } = args;
  ctx.budget.setRateLimit(operation, perMinute, perHour, perDay);

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

export async function handleGetRateLimitStatus(ctx: AnalyticsContext) {
  const statuses = ctx.budget.getRateLimitStatus();

  return respond({
    status: "success",
    operation: "get_rate_limit_status",
    summary: `${statuses.length} rate limits configured`,
    metadata: { rate_limits: statuses },
  });
}
