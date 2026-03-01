import fs from "node:fs/promises";
import path from "node:path";
import { glob } from "glob";
import { respond, respondError } from "@antigravity-os/shared";
import type { MemoryContext } from "./types.js";
import type {
  MemorySearchArgs, MemoryReadArgs, MemoryUpdateArgs,
  MemoryLogDecisionArgs, MemoryLogLessonArgs,
} from "../schemas.js";

function getFilePath(ctx: MemoryContext, key: string): string | undefined {
  return ctx.fileMap[key];
}

function getCategoryDir(ctx: MemoryContext, key: string): string | undefined {
  return ctx.categoryDirs[key];
}

function categorizeFile(filepath: string): string {
  if (filepath.includes("decisions")) return "decision";
  if (filepath.includes("lessons")) return "lesson";
  if (filepath.includes("core")) return "core";
  if (filepath.includes("active")) return "active";
  return "other";
}

async function keywordSearch(ctx: MemoryContext, query: string, categories: string[], topK: number) {
  const searchDirs = categories.includes("all")
    ? [ctx.memoryPath]
    : categories
      .map((c) => getCategoryDir(ctx, c))
      .filter((d): d is string => Boolean(d))
      .map((d) => path.join(ctx.memoryPath, d));

  const results: Array<{ file: string; preview: string; matches: number; category: string }> = [];

  for (const dir of searchDirs) {
    let files: string[];
    try {
      files = await glob("**/*.md", { cwd: dir, absolute: true });
    } catch { continue; }

    for (const file of files) {
      try {
        const content = await fs.readFile(file, "utf-8");
        const terms = query.toLowerCase().split(/\s+/);
        const lower = content.toLowerCase();
        const matchCount = terms.reduce((acc, term) => acc + (lower.includes(term) ? 1 : 0), 0);

        if (matchCount > 0) {
          const relPath = path.relative(ctx.memoryPath, file);
          const paragraphs = content.split("\n\n");
          let bestPara = "";
          let bestScore = 0;
          for (const p of paragraphs) {
            const pLower = p.toLowerCase();
            const score = terms.reduce((a, t) => a + (pLower.includes(t) ? 1 : 0), 0);
            if (score > bestScore) { bestScore = score; bestPara = p; }
          }

          results.push({
            file: relPath,
            preview: bestPara.slice(0, 300),
            matches: matchCount,
            category: categorizeFile(relPath),
          });
        }
      } catch { continue; }
    }
  }

  results.sort((a, b) => b.matches - a.matches);
  return results.slice(0, topK);
}

async function updateSection(filepath: string, sectionHeader: string, newContent: string): Promise<void> {
  let existing: string;
  try { existing = await fs.readFile(filepath, "utf-8"); } catch { existing = ""; }

  const lines = existing.split("\n");
  const headerLevel = sectionHeader.startsWith("###") ? 3 : sectionHeader.startsWith("##") ? 2 : 1;
  const headerPrefix = "#".repeat(headerLevel) + " ";
  const searchHeader = sectionHeader.startsWith("#") ? sectionHeader : `## ${sectionHeader}`;

  let startIdx = -1;
  let endIdx = lines.length;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === searchHeader.trim()) {
      startIdx = i;
    } else if (startIdx >= 0 && i > startIdx && lines[i].startsWith(headerPrefix.slice(0, headerLevel + 1))) {
      endIdx = i;
      break;
    }
  }

  if (startIdx >= 0) {
    const before = lines.slice(0, startIdx);
    const after = lines.slice(endIdx);
    const updated = [...before, searchHeader, newContent, ...after].join("\n");
    await fs.writeFile(filepath, updated, "utf-8");
  } else {
    await fs.appendFile(filepath, `\n\n${searchHeader}\n${newContent}`);
  }
}

export async function handleSearch(ctx: MemoryContext, args: MemorySearchArgs) {
  const { query, min_confidence: minConfidence } = args;
  const categories = args.categories ?? ["all"];
  const topK = args.top_k ?? 5;
  const includeMetadata = args.include_metadata ?? false;

  // Try semantic search first
  try {
    const semanticResults = await ctx.semantic.search(query, topK * 2);
    if (semanticResults.length > 0) {
      let filtered = categories.includes("all")
        ? semanticResults
        : semanticResults.filter((r) => categories.includes(r.category));

      if (minConfidence !== undefined) {
        const entries = ctx.temporal.getAllEntries(undefined, minConfidence);
        const highConfFiles = new Set(entries.map((e) => e.file));
        filtered = filtered.filter((r) => highConfFiles.has(r.file));
      }

      const results = filtered.slice(0, topK).map((r) => {
        const result: any = {
          file: r.file,
          category: r.category,
          preview: r.content.slice(0, 300),
          similarity: r.similarity.toFixed(3),
        };

        if (includeMetadata) {
          const entries = ctx.temporal.getAllEntries();
          const match = entries.find((e) => e.file === r.file);
          if (match) {
            result.confidence = match.confidence;
            result.confidence_status = ctx.temporal.getConfidenceStatus(match.confidence);
            result.last_validated = match.last_validated;
          }
        }

        return result;
      });

      return respond({
        status: "success",
        operation: "memory_search",
        summary: `Found ${results.length} results via semantic search`,
        metadata: { method: "semantic", result_count: results.length, results },
      });
    }
  } catch {
    // Fall through to keyword search
  }

  const results = await keywordSearch(ctx, query, categories, topK);
  return respond({
    status: "success",
    operation: "memory_search",
    summary: `Found ${results.length} results via keyword search`,
    metadata: { method: "keyword", result_count: results.length, results },
  });
}

export async function handleRead(ctx: MemoryContext, args: MemoryReadArgs) {
  const fileKey = args.file;
  const relPath = getFilePath(ctx, fileKey);
  if (!relPath) {
    return respondError(`Unknown file: ${fileKey}. Available: ${Object.keys(ctx.fileMap).join(", ")}`);
  }

  const fullPath = path.join(ctx.memoryPath, relPath);
  try {
    const content = await fs.readFile(fullPath, "utf-8");
    const lineCount = content.split("\n").length;

    const entries = ctx.temporal.getAllEntries();
    const fileEntries = entries.filter((e) => e.file === relPath);
    const confidence = fileEntries.length > 0
      ? fileEntries.reduce((sum, e) => sum + e.confidence, 0) / fileEntries.length
      : null;

    if (lineCount <= 5000) {
      return respond({
        status: "success",
        operation: "memory_read",
        summary: `Read ${relPath} (${lineCount} lines, full content)`,
        metadata: {
          file: relPath,
          content,
          line_count: lineCount,
          confidence: confidence !== null ? parseFloat(confidence.toFixed(3)) : "no_entries",
          tracked_entries: fileEntries.length,
        },
      });
    } else {
      const lines = content.split("\n");
      const chunkSize = 5000;
      const totalChunks = Math.ceil(lines.length / chunkSize);
      const chunk = args.chunk ?? 0;
      const start = chunk * chunkSize;
      const end = Math.min(start + chunkSize, lines.length);
      const chunkContent = lines.slice(start, end).join("\n");

      return respond({
        status: "success",
        operation: "memory_read",
        summary: `Read ${relPath} chunk ${chunk + 1}/${totalChunks} (${lineCount} total lines)`,
        metadata: {
          file: relPath,
          content: chunkContent,
          line_count: lineCount,
          chunk: chunk,
          total_chunks: totalChunks,
          chunk_lines: end - start,
          confidence: confidence !== null ? parseFloat(confidence.toFixed(3)) : "no_entries",
          tracked_entries: fileEntries.length,
          note: `Content split into ${totalChunks} chunks. Use memory_read with chunk parameter to read more.`,
        },
      });
    }
  } catch {
    return respondError(`File not found: ${relPath}. Create it first by using memory_update with operation "replace".`);
  }
}

export async function handleUpdate(ctx: MemoryContext, args: MemoryUpdateArgs) {
  const { file: fileKey, operation, content, section } = args;

  const relPath = getFilePath(ctx, fileKey);
  if (!relPath) return respondError(`Unknown file: ${fileKey}`);

  const fullPath = path.join(ctx.memoryPath, relPath);

  return await ctx.lockManager.withLock(fullPath, async () => {
    await fs.mkdir(path.dirname(fullPath), { recursive: true });

    if (operation === "append") {
      try {
        await fs.access(fullPath);
        await fs.appendFile(fullPath, "\n" + content);
      } catch {
        await fs.writeFile(fullPath, content, "utf-8");
      }
    } else if (operation === "replace") {
      await fs.writeFile(fullPath, content, "utf-8");
    } else if (operation === "update_section") {
      if (!section) return respondError("section parameter required for update_section operation");
      await updateSection(fullPath, section, content);
    }

    await ctx.git.commitChanges(fullPath, operation.toUpperCase(), `${operation} ${fileKey}`);
    const commitHash = await ctx.git.getLatestCommitHash();

    ctx.temporal.logOperation(`memory_update:${operation}`, relPath, commitHash ?? undefined, undefined, `Updated ${fileKey}`);

    return respond({
      status: "success",
      operation: "memory_update",
      summary: `${operation} on ${relPath}`,
      metadata: { file: relPath, operation, preview: content.slice(0, 200), commit_hash: commitHash },
    });
  });
}

export async function handleLogDecision(ctx: MemoryContext, args: MemoryLogDecisionArgs, checkIdempotency: (key: string) => unknown | null, storeIdempotency: (key: string, result: unknown) => void) {
  if (args.idempotency_key) {
    const cached = checkIdempotency(args.idempotency_key);
    if (cached) return cached;
  }

  const date = new Date().toISOString().split("T")[0];
  const entry = [
    `\n## ${date}: ${args.title}`,
    `**What:** ${args.what}`,
    `**Why:** ${args.why}`,
    args.alternatives?.length ? `**Alternatives:** ${args.alternatives.join(", ")}` : null,
    args.impact ? `**Impact:** ${args.impact}` : null,
    "\n---",
  ].filter(Boolean).join("\n");

  const fullPath = path.join(ctx.memoryPath, "decisions/ACTIVE.md");

  return await ctx.lockManager.withLock(fullPath, async () => {
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    try {
      await fs.access(fullPath);
      await fs.appendFile(fullPath, "\n" + entry);
    } catch {
      await fs.writeFile(fullPath, "# Active Decisions\n" + entry, "utf-8");
    }

    await ctx.git.commitChanges(fullPath, "DECISION", `Logged: ${args.title}`);
    const commitHash = await ctx.git.getLatestCommitHash();

    const tEntry = ctx.temporal.createEntry(
      `Decision: ${args.title} - ${args.what}`,
      "decisions/ACTIVE.md",
      "decision",
      `${date}: ${args.title}`,
      ["decision"]
    );
    ctx.temporal.logOperation("memory_log_decision", "decisions/ACTIVE.md", commitHash ?? undefined, tEntry.id, args.title);

    const result = respond({
      status: "success",
      operation: "memory_log_decision",
      summary: `Logged decision: ${args.title}`,
      metadata: { decision: args.title, date, file: "decisions/ACTIVE.md", entry_id: tEntry.id, confidence: tEntry.confidence },
    });

    if (args.idempotency_key) {
      storeIdempotency(args.idempotency_key, result);
    }
    return result;
  });
}

export async function handleLogLesson(ctx: MemoryContext, args: MemoryLogLessonArgs, checkIdempotency: (key: string) => unknown | null, storeIdempotency: (key: string, result: unknown) => void) {
  if (args.idempotency_key) {
    const cached = checkIdempotency(args.idempotency_key);
    if (cached) return cached;
  }

  const typeFileMap: Record<string, string> = {
    bug: "lessons/bugs_fixed.md",
    pattern: "lessons/best_practices.md",
    anti_pattern: "lessons/anti_patterns.md",
  };

  const relPath = typeFileMap[args.type];
  if (!relPath) return respondError(`Unknown lesson type: ${args.type}`);

  const fullPath = path.join(ctx.memoryPath, relPath);
  const parts = [`\n### ${args.category}: ${args.title}`];
  if (args.symptom) parts.push(`**Symptom:** ${args.symptom}`);
  if (args.root_cause) parts.push(`**Root Cause:** ${args.root_cause}`);
  if (args.fix) parts.push(`**Fix:** ${args.fix}`);
  if (args.prevention) parts.push(`**Prevention:** ${args.prevention}`);
  parts.push("\n---");
  const entryText = parts.join("\n");

  const headerMap: Record<string, string> = {
    bug: "# Bugs Fixed", pattern: "# Best Practices", anti_pattern: "# Anti-Patterns",
  };

  return await ctx.lockManager.withLock(fullPath, async () => {
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    try {
      await fs.access(fullPath);
      await fs.appendFile(fullPath, "\n" + entryText);
    } catch {
      await fs.writeFile(fullPath, headerMap[args.type] + "\n" + entryText, "utf-8");
    }

    await ctx.git.commitChanges(fullPath, "LESSON", `${args.type}: ${args.title}`);
    const commitHash = await ctx.git.getLatestCommitHash();

    const tEntry = ctx.temporal.createEntry(
      `${args.type}: ${args.category} - ${args.title}`,
      relPath,
      "lesson",
      `${args.category}: ${args.title}`,
      [args.type, args.category]
    );
    ctx.temporal.logOperation("memory_log_lesson", relPath, commitHash ?? undefined, tEntry.id, args.title);

    const result = respond({
      status: "success",
      operation: "memory_log_lesson",
      summary: `Logged ${args.type}: ${args.title}`,
      metadata: { type: args.type, category: args.category, title: args.title, file: relPath, entry_id: tEntry.id },
    });

    if (args.idempotency_key) {
      storeIdempotency(args.idempotency_key, result);
    }
    return result;
  });
}
