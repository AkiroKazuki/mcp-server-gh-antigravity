import { respond, respondError } from "@antigravity-os/shared";
import type { MemoryContext } from "./types.js";
import type { DetectContradictionsArgs, SuggestPruningArgs, ApplyPruningArgs, ResolveContradictionArgs } from "../schemas.js";

export async function handleDetectContradictions(ctx: MemoryContext, args: DetectContradictionsArgs) {
  const { category } = args;
  const threshold = args.threshold ?? 0.7;

  const entries = ctx.temporal.getAllEntries(category);

  if (entries.length < 2) {
    return respond({
      status: "success",
      operation: "detect_contradictions",
      summary: "Not enough entries to check for contradictions",
      metadata: { contradictions: [], checked_pairs: 0 },
    });
  }

  const conflictPairs = [
    ["use", "avoid"], ["prefer", "discourage"], ["yes", "no"],
    ["enable", "disable"], ["always", "never"], ["should", "should not"],
  ];

  const contradictions: Array<{
    entry1: { id: string; file: string; preview: string; confidence: number };
    entry2: { id: string; file: string; preview: string; confidence: number };
    similarity: number;
    conflict_type: string;
  }> = [];

  let checkedPairs = 0;
  const seenPairs = new Set<string>();

  // Cluster-first: for each entry, find similar entries via semantic index
  // then only check those pairs for contradictions (near O(n) vs O(n²))
  const useCluster = ctx.semantic.isReady() && ctx.semantic.hasIndex();

  if (useCluster) {
    for (const entry of entries) {
      const similar = await ctx.semantic.findSimilar(entry.content, 10, threshold);
      for (const match of similar) {
        // Find the matching entry by file + content overlap
        const matchEntry = entries.find((e) => e.file === match.file && e.id !== entry.id && e.content.includes(match.content.slice(0, 50)));
        if (!matchEntry) continue;

        const pairKey = [entry.id, matchEntry.id].sort().join(":");
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);
        checkedPairs++;

        const c1 = entry.content.toLowerCase();
        const c2 = matchEntry.content.toLowerCase();

        let conflictType = "similar_content";
        for (const [a, b] of conflictPairs) {
          if ((c1.includes(a) && c2.includes(b)) || (c1.includes(b) && c2.includes(a))) {
            conflictType = "direct";
            break;
          }
        }

        contradictions.push({
          entry1: { id: entry.id, file: entry.file, preview: entry.content.slice(0, 100), confidence: entry.confidence },
          entry2: { id: matchEntry.id, file: matchEntry.file, preview: matchEntry.content.slice(0, 100), confidence: matchEntry.confidence },
          similarity: parseFloat(match.similarity.toFixed(3)),
          conflict_type: conflictType,
        });
      }
    }
  } else {
    // Fallback: pairwise comparison when semantic index unavailable
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        checkedPairs++;
        const similarity = await ctx.semantic.pairwiseSimilarity(
          entries[i].content, entries[j].content
        );

        if (similarity >= threshold) {
          const c1 = entries[i].content.toLowerCase();
          const c2 = entries[j].content.toLowerCase();

          let conflictType = "similar_content";
          for (const [a, b] of conflictPairs) {
            if ((c1.includes(a) && c2.includes(b)) || (c1.includes(b) && c2.includes(a))) {
              conflictType = "direct";
              break;
            }
          }

          contradictions.push({
            entry1: { id: entries[i].id, file: entries[i].file, preview: entries[i].content.slice(0, 100), confidence: entries[i].confidence },
            entry2: { id: entries[j].id, file: entries[j].file, preview: entries[j].content.slice(0, 100), confidence: entries[j].confidence },
            similarity: parseFloat(similarity.toFixed(3)),
            conflict_type: conflictType,
          });
        }
      }
    }
  }

  contradictions.sort((a, b) =>
    Math.abs(a.entry1.confidence - a.entry2.confidence) -
    Math.abs(b.entry1.confidence - b.entry2.confidence)
  );

  return respond({
    status: "success",
    operation: "detect_contradictions",
    summary: `Found ${contradictions.length} potential contradictions in ${checkedPairs} pairs${useCluster ? " (cluster-first)" : " (pairwise)"}`,
    metadata: { contradictions, checked_pairs: checkedPairs, threshold, method: useCluster ? "cluster" : "pairwise" },
    ...(contradictions.length > 0 ? {
      next_steps: [
        "Review each contradiction and resolve by updating or archiving one entry",
        "Use resolve_contradiction to atomically keep one and archive the other",
        "Use validate_memory to boost the correct entry's confidence",
      ],
    } : {}),
  });
}

export async function handleSuggestPruning(ctx: MemoryContext, args: SuggestPruningArgs) {
  const { confidence_threshold: confidenceThreshold, age_days: ageDays } = args;

  const candidates = ctx.temporal.getPruningCandidates(confidenceThreshold, ageDays);

  return respond({
    status: "success",
    operation: "suggest_pruning",
    summary: `${candidates.length} entries recommended for pruning`,
    metadata: {
      candidates,
      threshold: confidenceThreshold ?? 0.3,
      age_days: ageDays ?? 90,
    },
    ...(candidates.length > 0 ? {
      next_steps: [
        "Review candidates and confirm which to archive",
        "Use apply_pruning with entry_ids to archive them",
        "Use validate_memory first if any should be kept",
      ],
      warnings: ["This is a dry run. No entries have been archived."],
    } : {}),
  });
}

export async function handleApplyPruning(ctx: MemoryContext, args: ApplyPruningArgs) {
  const { entry_ids: entryIds } = args;

  if (!entryIds || entryIds.length === 0) {
    return respondError("No entry_ids provided. Use suggest_pruning first.");
  }

  const result = ctx.temporal.archiveEntries(entryIds);

  const commitHash = await ctx.git.commitAll("PRUNE", `Archived ${result.archived} entries`);

  ctx.temporal.logOperation(
    "apply_pruning",
    undefined,
    commitHash ?? undefined,
    undefined,
    `Archived ${result.archived} entries: ${entryIds.join(", ")}`
  );

  return respond({
    status: "success",
    operation: "apply_pruning",
    summary: `Archived ${result.archived} entries`,
    metadata: {
      archived: result.archived,
      entry_ids: entryIds,
      commit_hash: commitHash,
    },
  });
}

export async function handleResolveContradiction(ctx: MemoryContext, args: ResolveContradictionArgs) {
  const { entry_id_to_keep: keepId, entry_id_to_archive: archiveId, resolution_rationale: rationale } = args;

  const result = ctx.temporal.resolveContradiction(keepId, archiveId, rationale);
  const commitHash = await ctx.git.commitAll("RESOLVE", `Resolved contradiction: kept ${keepId}, archived ${archiveId}`);

  return respond({
    status: "success",
    operation: "resolve_contradiction",
    summary: `Resolved: kept "${result.kept.content.slice(0, 60)}..." (confidence: ${result.new_confidence.toFixed(2)})`,
    metadata: {
      kept_entry_id: keepId,
      archived_entry_id: archiveId,
      new_confidence: result.new_confidence,
      confidence_status: result.status,
      rationale,
      commit_hash: commitHash,
    },
  });
}
