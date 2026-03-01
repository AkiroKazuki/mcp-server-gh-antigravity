import fs from "node:fs/promises";
import path from "node:path";
import { respond, respondError } from "@antigravity-os/shared";
import type { AnalyticsContext } from "./types.js";
import type { ExportAnalyticsArgs, LogResearchOutcomeArgs, SetBudgetOverrideArgs } from "../schemas.js";

export async function handleExportAnalytics(ctx: AnalyticsContext, args: ExportAnalyticsArgs) {
  const include = args.include ?? ["costs", "performance", "scores", "health"];
  const exportData: Record<string, any> = {
    exported_at: new Date().toISOString(),
    version: "2.1.0",
  };

  if (include.includes("costs")) {
    try {
      exportData.costs = await ctx.budget.getSpendForPeriod("all");
    } catch {
      exportData.costs = { error: "Could not read cost data" };
    }
  }

  if (include.includes("performance")) {
    exportData.performance = ctx.profiler.getProfile("week");
  }

  if (include.includes("scores")) {
    exportData.scores = ctx.db.prepare(`SELECT * FROM scores`).all();
  }

  if (include.includes("health")) {
    exportData.health = await ctx.health.check();
  }

  const exportDir = path.join(ctx.memoryPath, "snapshots");
  await fs.mkdir(exportDir, { recursive: true });
  const exportFile = `analytics_export_${Date.now()}.json`;
  const exportPath = path.join(exportDir, exportFile);
  await fs.writeFile(exportPath, JSON.stringify(exportData, null, 2), "utf-8");

  return respond({
    status: "success",
    operation: "export_analytics",
    summary: `Exported ${include.join(", ")} to ${exportFile}`,
    metadata: {
      export_file: path.relative(ctx.memoryPath, exportPath),
      sections: include,
      size_bytes: JSON.stringify(exportData).length,
    },
  });
}

export async function handleLogResearchOutcome(ctx: AnalyticsContext, args: LogResearchOutcomeArgs) {
  const { research_id: researchId, implementation_file: implementationFile, outcome } = args;
  const metrics: Record<string, unknown> = args.metrics ?? {};

  const metadataPath = path.join(ctx.memoryPath, "research", "analyses", researchId, "metadata.json");

  let metadata: any;
  try {
    const metaRaw = await fs.readFile(metadataPath, "utf-8");
    metadata = JSON.parse(metaRaw);
  } catch {
    return respondError(`Research not found: ${researchId}`);
  }

  if (!metadata.outcomes) metadata.outcomes = [];
  metadata.outcomes.push({
    file: implementationFile,
    outcome,
    metrics,
    logged_at: new Date().toISOString(),
  });

  if (outcome === "success") {
    metadata.validation_count = (metadata.validation_count || 0) + 1;
  } else if (outcome === "failed") {
    metadata.contradiction_count = (metadata.contradiction_count || 0) + 1;
  }

  const successes = metadata.outcomes.filter((o: any) => o.outcome === "success").length;
  const failures = metadata.outcomes.filter((o: any) => o.outcome === "failed").length;
  const total = metadata.outcomes.length;
  const successRate = successes / total;
  const failureRate = failures / total;
  metadata.confidence = Math.max(0.1, Math.min(1.0, parseFloat((0.5 + successRate * 0.5 - failureRate * 0.3).toFixed(2))));

  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), "utf-8");

  ctx.db.prepare(
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

// --- Budget Override ---

interface BudgetOverride {
  reason: string;
  multiplier: number;
  expiresAt: number;
  createdAt: string;
}

let activeBudgetOverride: BudgetOverride | null = null;

/** Check if there's an active (non-expired) budget override. */
export function getActiveBudgetOverride(): BudgetOverride | null {
  if (!activeBudgetOverride) return null;
  if (Date.now() > activeBudgetOverride.expiresAt) {
    activeBudgetOverride = null;
    return null;
  }
  return activeBudgetOverride;
}

export async function handleSetBudgetOverride(_ctx: AnalyticsContext, args: SetBudgetOverrideArgs) {
  const { reason } = args;
  const multiplier = args.multiplier ?? 2;
  const durationMinutes = args.duration_minutes ?? 60;

  activeBudgetOverride = {
    reason,
    multiplier,
    expiresAt: Date.now() + durationMinutes * 60 * 1000,
    createdAt: new Date().toISOString(),
  };

  const expiresAt = new Date(activeBudgetOverride.expiresAt).toISOString();

  return respond({
    status: "success",
    operation: "set_budget_override",
    summary: `Budget override active: ${multiplier}x limits for ${durationMinutes}min`,
    metadata: {
      reason,
      multiplier,
      duration_minutes: durationMinutes,
      expires_at: expiresAt,
      created_at: activeBudgetOverride.createdAt,
    },
    ...(multiplier >= 3 ? {
      warnings: [`High multiplier (${multiplier}x) — monitor spend closely`],
    } : {}),
  });
}
