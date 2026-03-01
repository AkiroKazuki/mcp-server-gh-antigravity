import fs from "node:fs/promises";
import path from "node:path";
import { respond, respondError } from "@antigravity-os/shared";
import type { MemoryContext } from "./types.js";
import type {
  MemorySnapshotArgs, ContextSummaryArgs, MemoryHistoryArgs,
  MemoryRollbackArgs, MemoryDiffArgs, MemoryUndoArgs,
} from "../schemas.js";

function getFilePath(ctx: MemoryContext, key: string): string | undefined {
  return ctx.fileMap[key];
}

export async function handleSnapshot(ctx: MemoryContext, args: MemorySnapshotArgs) {
  const tag = args?.tag || "";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const snapshotName = tag ? `snapshot_${tag}_${timestamp}.json` : `snapshot_${timestamp}.json`;

  const snapshotDir = path.join(ctx.memoryPath, "snapshots");
  await fs.mkdir(snapshotDir, { recursive: true });

  const snapshot: Record<string, any> = {
    created_at: new Date().toISOString(),
    tag: tag || null,
    version: "2.1.0",
    files: {},
    confidence_data: {},
  };

  for (const [key, relPath] of Object.entries(ctx.fileMap)) {
    const fullPath = path.join(ctx.memoryPath, relPath);
    try { snapshot.files[key] = await fs.readFile(fullPath, "utf-8"); } catch { snapshot.files[key] = null; }
  }

  const entries = ctx.temporal.getAllEntries();
  snapshot.confidence_data = {
    total_entries: entries.length,
    avg_confidence: entries.length > 0 ? entries.reduce((s, e) => s + e.confidence, 0) / entries.length : 0,
    entries: entries.map((e) => ({ id: e.id, file: e.file, confidence: e.confidence, category: e.category })),
  };

  const snapshotPath = path.join(snapshotDir, snapshotName);
  await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), "utf-8");

  return respond({
    status: "success",
    operation: "memory_snapshot",
    summary: `Snapshot created: ${snapshotName}`,
    metadata: {
      snapshot_file: path.relative(ctx.memoryPath, snapshotPath),
      tag: tag || null,
      files_captured: Object.keys(snapshot.files).length,
      entries_tracked: entries.length,
      timestamp: snapshot.created_at,
    },
  });
}

export async function handleContextSummary(ctx: MemoryContext, args: ContextSummaryArgs) {
  const focusArea = args.focus_area;
  const minConfidence = args.min_confidence ?? 0;

  const summary: Record<string, any> = {};

  const extractSummary = async (fileKey: string): Promise<string | null> => {
    const relPath = getFilePath(ctx, fileKey);
    if (!relPath) return null;
    try {
      const content = await fs.readFile(path.join(ctx.memoryPath, relPath), "utf-8");
      const lines = content.split("\n").filter((l) => l.trim() && !l.startsWith("#")).slice(0, 5);
      return lines.join("\n");
    } catch { return null; }
  };

  if (!focusArea || focusArea === "tech_stack") summary.tech_stack = await extractSummary("tech_stack");
  if (!focusArea || focusArea === "architecture") {
    summary.architecture = await extractSummary("architecture");
    summary.project_overview = await extractSummary("project_overview");
  }
  if (!focusArea || focusArea === "recent_changes") {
    summary.decisions = await extractSummary("decisions_active");
    summary.recent_lessons = await extractSummary("bugs_fixed");
  }
  if (!focusArea || focusArea === "blockers") {
    summary.blockers = await extractSummary("blockers");
    summary.task_queue = await extractSummary("task_queue");
  }
  summary.active_context = await extractSummary("active_context");

  const entries = ctx.temporal.getAllEntries(undefined, minConfidence > 0 ? minConfidence : undefined);
  summary.confidence_overview = {
    tracked_entries: entries.length,
    high_confidence: entries.filter((e) => e.confidence >= 0.7).length,
    medium_confidence: entries.filter((e) => e.confidence >= 0.4 && e.confidence < 0.7).length,
    low_confidence: entries.filter((e) => e.confidence < 0.4).length,
  };

  return respond({
    status: "success",
    operation: "get_context_summary",
    summary: `Context summary for ${focusArea || "all"}`,
    metadata: { focus: focusArea || "all", summary },
  });
}

export async function handleHistory(ctx: MemoryContext, args: MemoryHistoryArgs) {
  const fileKey = args.file;
  const limit = args.limit ?? 10;
  const relPath = getFilePath(ctx, fileKey);
  if (!relPath) return respondError(`Unknown file: ${fileKey}`);

  const fullPath = path.join(ctx.memoryPath, relPath);
  const history = await ctx.git.getHistory(fullPath, limit);

  return respond({
    status: "success",
    operation: "memory_history",
    summary: `${history.length} commits for ${relPath}`,
    metadata: { file: relPath, commits: history.length, history },
  });
}

export async function handleRollback(ctx: MemoryContext, args: MemoryRollbackArgs) {
  const { file: fileKey, commit_hash: commitHash } = args;
  const relPath = getFilePath(ctx, fileKey);
  if (!relPath) return respondError(`Unknown file: ${fileKey}`);

  const fullPath = path.join(ctx.memoryPath, relPath);

  return await ctx.lockManager.withLock(fullPath, async () => {
    await ctx.git.rollback(fullPath, commitHash);
    ctx.temporal.logOperation("memory_rollback", relPath, commitHash, undefined, `Rolled back to ${commitHash}`);

    return respond({
      status: "success",
      operation: "memory_rollback",
      summary: `Rolled back ${relPath} to ${commitHash}`,
      metadata: { file: relPath, rolled_back_to: commitHash },
    });
  });
}

export async function handleDiff(ctx: MemoryContext, args: MemoryDiffArgs) {
  const { file: fileKey, commit_hash: commitHash } = args;
  const relPath = getFilePath(ctx, fileKey);
  if (!relPath) return respondError(`Unknown file: ${fileKey}`);

  const fullPath = path.join(ctx.memoryPath, relPath);
  const diff = await ctx.git.getDiff(fullPath, commitHash);

  return respond({
    status: "success",
    operation: "memory_diff",
    summary: diff ? `Changes found for ${relPath}` : `No changes for ${relPath}`,
    metadata: { file: relPath, diff: diff || "No changes found." },
  });
}

export async function handleUndo(ctx: MemoryContext, args: MemoryUndoArgs) {
  const steps = Math.min(args.steps ?? 1, 10);

  const operations = ctx.temporal.getRecentOperations(steps);

  if (operations.length === 0) {
    return respond({
      status: "success",
      operation: "memory_undo",
      summary: "No operations to undo",
      metadata: { undone: 0 },
    });
  }

  const undone: Array<{ operation: string; file?: string; commit_hash?: string }> = [];

  for (const op of operations) {
    if (op.commit_hash) {
      try {
        const { execFile } = await import("node:child_process");
        const { promisify } = await import("node:util");
        const execFileAsync = promisify(execFile);

        const { stdout } = await execFileAsync(
          "git", ["rev-parse", `${op.commit_hash}~1`],
          { cwd: ctx.memoryPath }
        );
        const parentHash = stdout.trim();

        if (parentHash && op.file) {
          const fullPath = path.join(ctx.memoryPath, op.file);
          await ctx.git.rollback(fullPath, parentHash);
          undone.push({ operation: op.operation, file: op.file, commit_hash: op.commit_hash });
        }
      } catch {
        // Could not undo this operation
      }
    }
  }

  ctx.temporal.logOperation("memory_undo", undefined, undefined, undefined, `Undid ${undone.length} operations`);

  return respond({
    status: "success",
    operation: "memory_undo",
    summary: `Undid ${undone.length} of ${steps} requested operations`,
    metadata: { undone: undone.length, operations_reversed: undone },
  });
}
