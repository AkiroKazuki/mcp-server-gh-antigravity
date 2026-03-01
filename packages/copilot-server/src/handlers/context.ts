import { respond } from "@antigravity-os/shared";
import type { CopilotContext } from "./types.js";
import type { GetContextArgs, CacheClearArgs } from "../schemas.js";

export async function handleGetContext(ctx: CopilotContext, args: GetContextArgs) {
  const { target_file: targetFile } = args;
  const maxDepth = args.max_depth ?? 1;
  const includeTypes = args.include_types ?? true;
  const includeGitDiff = args.include_git_diff ?? true;

  const context = await ctx.contextGatherer.gatherContext(targetFile, {
    maxDepth,
    includeTypes,
    includeGitDiff,
  });

  return respond({
    status: "success",
    operation: "copilot_get_context",
    summary: `Context gathered for ${targetFile} (${context.length} chars)`,
    metadata: {
      target_file: targetFile,
      context_length: context.length,
      context,
    },
  });
}

export async function handleCacheClear(ctx: CopilotContext, args: CacheClearArgs) {
  const scope = args.scope ?? "all";
  const result = ctx.cache.clear(scope);

  return respond({
    status: "success",
    operation: "copilot_cache_clear",
    summary: `Cleared ${result.cleared} cache entries (scope: ${scope})`,
    metadata: { scope, cleared: result.cleared },
  });
}

export async function handleCacheStats(ctx: CopilotContext) {
  const stats = ctx.cache.getStats();

  return respond({
    status: "success",
    operation: "copilot_cache_stats",
    summary: `Cache: ${stats.total_entries} entries, ${stats.hit_rate} hit rate`,
    metadata: stats,
  });
}
