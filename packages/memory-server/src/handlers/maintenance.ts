import path from "node:path";
import { respond } from "@antigravity-os/shared";
import type { MemoryContext } from "./types.js";
import type { ReindexMemoryArgs, ValidateMemoryArgs } from "../schemas.js";
import { Logger } from "@antigravity-os/shared";

const log = new Logger("memory-server");

export async function handleReindex(ctx: MemoryContext, _args: ReindexMemoryArgs) {
  const newEntries = await ctx.temporal.syncFromMarkdown();
  const decayed = ctx.temporal.applyDecay();

  let semanticResult = { chunksIndexed: 0, filesProcessed: 0 };
  try {
    semanticResult = await ctx.semantic.indexMemory();
  } catch (err: any) {
    log.warn("Semantic indexing failed", { error: err.message });
  }

  return respond({
    status: "success",
    operation: "reindex_memory",
    summary: `Reindexed: ${semanticResult.chunksIndexed} chunks, ${newEntries} new entries synced, ${decayed} confidence scores updated`,
    metadata: {
      semantic: semanticResult,
      temporal: { new_entries_synced: newEntries, confidence_decayed: decayed },
    },
  });
}

export async function handleShowLocks(ctx: MemoryContext) {
  const locks = ctx.lockManager.getActiveLocks();
  return respond({
    status: "success",
    operation: "show_locks",
    summary: `${locks.length} active locks`,
    metadata: {
      active_locks: locks.length,
      locks: locks.map((l) => ({
        file: path.relative(ctx.memoryPath, l.file),
        queue_length: l.queueLength,
      })),
    },
  });
}

export async function handleValidateMemory(ctx: MemoryContext, args: ValidateMemoryArgs) {
  const { entry_id: entryId, notes } = args;

  const result = ctx.temporal.validateEntry(entryId, notes);

  ctx.temporal.logOperation("validate_memory", undefined, undefined, entryId, notes ?? "validated");

  return respond({
    status: "success",
    operation: "validate_memory",
    summary: `Entry ${entryId} validated. Confidence: ${result.new_confidence.toFixed(3)} (${result.status})`,
    metadata: {
      entry_id: entryId,
      new_confidence: result.new_confidence,
      confidence_status: result.status,
      notes: notes || null,
    },
  });
}

export async function handleHealthReport(ctx: MemoryContext) {
  const report = ctx.temporal.getHealthReport();

  return respond({
    status: "success",
    operation: "memory_health_report",
    summary: `Health score: ${report.health_score}/100. ${report.summary.total_entries} entries tracked.`,
    metadata: report,
  });
}
