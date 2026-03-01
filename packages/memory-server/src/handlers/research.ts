import path from "node:path";
import { respond, respondError } from "@antigravity-os/shared";
import type { MemoryContext } from "./types.js";
import type { ImportResearchArgs, GetResearchContextArgs } from "../schemas.js";

export async function handleImportResearch(ctx: MemoryContext, args: ImportResearchArgs) {
  const { markdown_content, title, tags, source } = args;

  const result = await ctx.research.importResearch({
    markdown_content,
    title,
    tags,
    source,
  });

  await ctx.git.commitAll("IMPORT", `Imported research: ${title}`);
  const commitHash = await ctx.git.getLatestCommitHash();

  const tEntry = ctx.temporal.createEntry(
    `Research: ${title}`,
    `research/analyses/${result.researchId}/metadata.json`,
    "research",
    title,
    tags || [],
  );

  ctx.temporal.logOperation(
    "import_research_analysis",
    `research/analyses/${result.researchId}`,
    commitHash ?? undefined,
    tEntry.id,
    `Imported: ${title}`,
  );

  return respond({
    status: "success",
    operation: "import_research_analysis",
    summary: `Imported "${title}" with ${result.sections.length} structured sections`,
    metadata: {
      research_id: result.researchId,
      sections_found: result.sections,
      location: path.relative(ctx.memoryPath, result.researchDir),
      title,
      tags: tags || [],
      source: source || "Unknown",
      confidence: result.metadata.confidence,
      entry_id: tEntry.id,
    },
  });
}

export async function handleGetResearchContext(ctx: MemoryContext, args: GetResearchContextArgs) {
  const { research_id, sections, specific_topic } = args;

  try {
    const result = await ctx.research.getResearchContext({
      research_id,
      sections,
      specific_topic,
    });

    return respond({
      status: "success",
      operation: "get_research_context",
      summary: `Retrieved ${Object.keys(result.content).length} sections for "${result.title}" (${result.full_content_length} chars)`,
      metadata: {
        research_id: result.research_id,
        title: result.title,
        source: result.source,
        tags: result.tags,
        content: result.content,
        full_content_length: result.full_content_length,
        sections_returned: Object.keys(result.content),
      },
    });
  } catch (error: any) {
    return respondError(`Research not found: ${research_id}. Error: ${error.message}`);
  }
}
