import path from "node:path";
import { respond, respondError, Logger } from "@antigravity-os/shared";
import type { MemoryContext } from "./types.js";
import type { ImportResearchArgs, GetResearchContextArgs, IngestUrlArgs } from "../schemas.js";
import { NodeHtmlMarkdown } from "node-html-markdown";

const log = new Logger("memory-server");
const htmlToMd = new NodeHtmlMarkdown();

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

export async function handleIngestUrl(ctx: MemoryContext, args: IngestUrlArgs) {
  const { url, title, tags } = args;
  const maxLength = args.max_length ?? 50000;

  log.info("Ingesting URL", { url, title });

  // Fetch the URL
  let html: string;
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Antigravity-OS/2.1 Research Ingestion" },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      return respondError(`Failed to fetch URL: ${response.status} ${response.statusText}`);
    }
    html = await response.text();
  } catch (error: any) {
    return respondError(`Failed to fetch URL: ${error.message}`);
  }

  // Convert HTML to Markdown
  let markdown: string;
  const contentType = html.trimStart();
  if (contentType.startsWith("#") || !contentType.startsWith("<")) {
    // Already markdown or plain text
    markdown = html;
  } else {
    markdown = htmlToMd.translate(html);
  }

  // Truncate if too long
  if (markdown.length > maxLength) {
    markdown = markdown.slice(0, maxLength) + "\n\n... (truncated)";
  }

  // Prepend source header
  const fullContent = `# ${title}\n\n> Source: ${url}\n> Ingested: ${new Date().toISOString()}\n\n${markdown}`;

  // Import as research entry
  const result = await ctx.research.importResearch({
    markdown_content: fullContent,
    title,
    tags,
    source: url,
  });

  await ctx.git.commitAll("INGEST", `Ingested URL: ${title}`);
  const commitHash = await ctx.git.getLatestCommitHash();

  const tEntry = ctx.temporal.createEntry(
    `URL Ingest: ${title}`,
    `research/analyses/${result.researchId}/metadata.json`,
    "research",
    title,
    tags || [],
  );

  ctx.temporal.logOperation(
    "memory_ingest_url",
    `research/analyses/${result.researchId}`,
    commitHash ?? undefined,
    tEntry.id,
    `Ingested from ${url}`,
  );

  return respond({
    status: "success",
    operation: "memory_ingest_url",
    summary: `Ingested "${title}" from ${url} (${markdown.length} chars, ${result.sections.length} sections)`,
    metadata: {
      research_id: result.researchId,
      url,
      title,
      tags: tags || [],
      content_length: markdown.length,
      sections_found: result.sections,
      location: path.relative(ctx.memoryPath, result.researchDir),
      entry_id: tEntry.id,
    },
  });
}
