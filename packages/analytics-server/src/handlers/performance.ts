import { respond } from "@antigravity-os/shared";
import type { AnalyticsContext } from "./types.js";
import type { GetInsightsArgs, GetPerformanceProfileArgs, GetBottlenecksArgs } from "../schemas.js";

export async function handleGetCopilotPerformance(ctx: AnalyticsContext) {
  const scores = ctx.db.prepare(
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

export async function handleGetInsights(ctx: AnalyticsContext, args: GetInsightsArgs) {
  const focus = args.focus ?? "all";
  const insights: string[] = [];

  if (focus === "all" || focus === "cost") {
    const today = new Date().toISOString().split("T")[0];
    const todaySpend = await ctx.budget.getSpendForDate(today);
    const config = ctx.budget.getConfig();
    const pct = (todaySpend / config.daily_limit_usd) * 100;

    if (pct > 80) {
      insights.push(`WARNING: Daily spend at ${pct.toFixed(0)}% of limit ($${todaySpend.toFixed(2)}/$${config.daily_limit_usd})`);
    } else if (pct > 50) {
      insights.push(`Daily spend at ${pct.toFixed(0)}% of limit. Consider batching remaining tasks.`);
    } else {
      insights.push(`Daily budget health: ${pct.toFixed(0)}% used. Plenty of budget remaining.`);
    }
  }

  if (focus === "all" || focus === "performance") {
    const bottlenecks = ctx.profiler.getBottlenecks(2000);
    if (bottlenecks.length > 0) {
      insights.push(`${bottlenecks.length} slow operations detected (>2s avg). Top: ${bottlenecks[0].operation} (${bottlenecks[0].avg_duration_ms.toFixed(0)}ms)`);
    } else {
      insights.push("No performance bottlenecks detected.");
    }
  }

  if (focus === "all" || focus === "quality") {
    const scores = ctx.db.prepare(
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

export async function handleGetPerformanceProfile(ctx: AnalyticsContext, args: GetPerformanceProfileArgs) {
  const timeWindow = args.time_window ?? "day";
  const profile = ctx.profiler.getProfile(timeWindow);

  return respond({
    status: "success",
    operation: "get_performance_profile",
    summary: `${profile.total_operations} operations in last ${timeWindow}, avg ${profile.avg_duration_ms.toFixed(0)}ms`,
    metadata: profile,
  });
}

export async function handleSystemHealth(ctx: AnalyticsContext) {
  const result = await ctx.health.check();

  return respond({
    status: "success",
    operation: "system_health",
    summary: `System: ${result.overall_status}. ${result.alerts.length} alerts.`,
    metadata: result,
    ...(result.alerts.length > 0 ? { warnings: result.alerts } : {}),
    ...(result.recommendations.length > 0 ? { next_steps: result.recommendations } : {}),
  });
}

export async function handleGetSkillEffectiveness(ctx: AnalyticsContext) {
  const scores = ctx.db.prepare(
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

export async function handleGetBottlenecks(ctx: AnalyticsContext, args: GetBottlenecksArgs) {
  const thresholdMs = args.threshold_ms ?? 1000;
  const bottlenecks = ctx.profiler.getBottlenecks(thresholdMs);

  return respond({
    status: "success",
    operation: "get_bottlenecks",
    summary: `${bottlenecks.length} operations above ${thresholdMs}ms threshold`,
    metadata: { threshold_ms: thresholdMs, bottlenecks },
  });
}
