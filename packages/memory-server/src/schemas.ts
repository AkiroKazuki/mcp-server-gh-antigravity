/**
 * Antigravity OS v2.1 - Memory Server Zod Schemas
 * Single source of truth for tool input validation and JSON schema generation.
 */

import { z } from "zod";

// --- Tool Schemas ---

export const MemorySearchSchema = z.object({
  query: z.string().describe("Search query"),
  categories: z.array(z.string()).optional().describe('Filter by category: "decisions", "lessons", "core", "active", "patterns", "all"'),
  top_k: z.number().optional().describe("Number of results (default: 5)"),
  min_confidence: z.number().optional().describe("Minimum confidence threshold (0-1)"),
  include_metadata: z.boolean().optional().describe("Include confidence metadata in results"),
});

export const MemoryReadSchema = z.object({
  file: z.string().describe("Memory file to read"),
  chunk: z.number().optional().describe("Chunk index for files >5000 lines (default: 0)"),
});

export const MemoryUpdateSchema = z.object({
  file: z.string().describe("Memory file to update"),
  operation: z.enum(["append", "replace", "update_section"]).describe("Type of update"),
  content: z.string().describe("Content to add/update"),
  section: z.string().optional().describe("Section header to update (for update_section operation)"),
});

export const MemoryLogDecisionSchema = z.object({
  title: z.string().describe("Decision title"),
  what: z.string().describe("One-sentence summary"),
  why: z.string().describe("Reasoning (2-3 sentences)"),
  alternatives: z.array(z.string()).optional().describe("Options considered"),
  impact: z.string().optional().describe("What this changes"),
  idempotency_key: z.string().optional().describe("Unique key to prevent duplicate entries on retry"),
});

export const MemoryLogLessonSchema = z.object({
  category: z.string().describe('Category (e.g., "Python Typing")'),
  type: z.enum(["bug", "pattern", "anti_pattern"]).describe("Type of lesson"),
  title: z.string().describe("Brief description"),
  symptom: z.string().optional().describe("What went wrong (for bugs)"),
  root_cause: z.string().optional().describe("Why it happened"),
  fix: z.string().optional().describe("How we fixed it"),
  prevention: z.string().optional().describe("How to avoid in future"),
  idempotency_key: z.string().optional().describe("Unique key to prevent duplicate entries on retry"),
});

export const MemorySnapshotSchema = z.object({
  tag: z.string().optional().describe("Optional tag for this snapshot"),
});

export const ContextSummarySchema = z.object({
  focus_area: z.string().optional().describe('"architecture", "recent_changes", "blockers", "tech_stack"'),
  min_confidence: z.number().optional().describe("Filter by minimum confidence (0-1)"),
});

export const MemoryHistorySchema = z.object({
  file: z.string().describe("Memory file"),
  limit: z.number().optional().describe("Number of commits (default: 10)"),
});

export const MemoryRollbackSchema = z.object({
  file: z.string().describe("Memory file"),
  commit_hash: z.string().describe("Git commit hash from memory_history"),
});

export const MemoryDiffSchema = z.object({
  file: z.string().describe("Memory file"),
  commit_hash: z.string().optional().describe("Compare to specific commit"),
});

export const ReindexMemorySchema = z.object({
  force: z.boolean().optional().describe("Force reindex even if recently indexed"),
});

export const ValidateMemorySchema = z.object({
  entry_id: z.string().describe("Memory entry ID to validate"),
  notes: z.string().optional().describe("Optional validation notes"),
});

export const DetectContradictionsSchema = z.object({
  category: z.string().optional().describe("Filter by category"),
  threshold: z.number().optional().describe("Similarity threshold (default: 0.7)"),
});

export const SuggestPruningSchema = z.object({
  confidence_threshold: z.number().optional().describe("Max confidence to consider (default: 0.3)"),
  age_days: z.number().optional().describe("Min age to consider (default: 90)"),
});

export const ApplyPruningSchema = z.object({
  entry_ids: z.array(z.string()).describe("Entry IDs to archive"),
});

export const ResolveContradictionSchema = z.object({
  entry_id_to_keep: z.string().describe("ID of the entry to keep and boost confidence for"),
  entry_id_to_archive: z.string().describe("ID of the contradicting entry to archive"),
  resolution_rationale: z.string().describe("Explanation of why this entry was chosen over the other"),
});

export const MemoryUndoSchema = z.object({
  steps: z.number().optional().describe("Number of operations to undo (default: 1, max: 10)"),
});

export const ImportResearchSchema = z.object({
  markdown_content: z.string().describe("Full markdown content from Sonnet (.md file content)"),
  title: z.string().describe("Research title (e.g., 'Mean Reversion EUR/USD Analysis')"),
  tags: z.array(z.string()).optional().describe("Tags for categorization (e.g., ['mean-reversion', 'EUR/USD'])"),
  source: z.string().optional().describe("Source reference (e.g., 'Journal of Finance 2024')"),
});

export const GetResearchContextSchema = z.object({
  research_id: z.string().describe("Research ID from import_research_analysis"),
  sections: z.array(z.string()).optional().describe("Sections to retrieve (e.g., ['implementation', 'findings']). Omit for all."),
  specific_topic: z.string().optional().describe("Optional: Extract only content related to specific topic (e.g., 'stop loss')"),
});

// --- Types inferred from schemas ---

export type MemorySearchArgs = z.infer<typeof MemorySearchSchema>;
export type MemoryReadArgs = z.infer<typeof MemoryReadSchema>;
export type MemoryUpdateArgs = z.infer<typeof MemoryUpdateSchema>;
export type MemoryLogDecisionArgs = z.infer<typeof MemoryLogDecisionSchema>;
export type MemoryLogLessonArgs = z.infer<typeof MemoryLogLessonSchema>;
export type MemorySnapshotArgs = z.infer<typeof MemorySnapshotSchema>;
export type ContextSummaryArgs = z.infer<typeof ContextSummarySchema>;
export type MemoryHistoryArgs = z.infer<typeof MemoryHistorySchema>;
export type MemoryRollbackArgs = z.infer<typeof MemoryRollbackSchema>;
export type MemoryDiffArgs = z.infer<typeof MemoryDiffSchema>;
export type ReindexMemoryArgs = z.infer<typeof ReindexMemorySchema>;
export type ValidateMemoryArgs = z.infer<typeof ValidateMemorySchema>;
export type DetectContradictionsArgs = z.infer<typeof DetectContradictionsSchema>;
export type SuggestPruningArgs = z.infer<typeof SuggestPruningSchema>;
export type ApplyPruningArgs = z.infer<typeof ApplyPruningSchema>;
export type ResolveContradictionArgs = z.infer<typeof ResolveContradictionSchema>;
export type MemoryUndoArgs = z.infer<typeof MemoryUndoSchema>;
export type ImportResearchArgs = z.infer<typeof ImportResearchSchema>;
export type GetResearchContextArgs = z.infer<typeof GetResearchContextSchema>;

export const IngestUrlSchema = z.object({
  url: z.string().url().describe("URL to fetch and ingest (HTML page or raw markdown)"),
  title: z.string().describe("Title for the ingested research entry"),
  tags: z.array(z.string()).optional().describe("Tags to categorize the research (e.g., ['api', 'typescript'])"),
  max_length: z.number().int().min(1000).max(100000).optional().describe("Max content length in characters (default: 50000)"),
});
export type IngestUrlArgs = z.infer<typeof IngestUrlSchema>;

// --- JSON Schema generation helper ---

function toJsonSchema(schema: z.ZodType, required?: string[]) {
  const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
  delete jsonSchema.$schema;
  if (required) {
    jsonSchema.required = required;
  }
  return jsonSchema;
}

// --- Tool definitions using Zod schemas ---

export function getMemoryToolDefinitions(fileKeys: string[]) {
  return [
    {
      name: "memory_search",
      description: "Search across memory files with confidence ranking. Uses semantic search when available.",
      inputSchema: toJsonSchema(MemorySearchSchema, ["query"]),
    },
    {
      name: "memory_read",
      description: "Read a specific memory file by name. Returns full content (no summaries unless >5000 lines). Includes confidence data.",
      inputSchema: {
        ...toJsonSchema(MemoryReadSchema, ["file"]),
        properties: {
          file: { type: "string", enum: fileKeys, description: "Memory file to read" },
          chunk: { type: "number", description: "Chunk index for files >5000 lines (default: 0)" },
        },
      },
    },
    {
      name: "memory_update",
      description: "Update a memory file. Thread-safe with file locking, git auto-commit, and temporal metadata.",
      inputSchema: {
        ...toJsonSchema(MemoryUpdateSchema, ["file", "operation", "content"]),
        properties: {
          file: { type: "string", enum: fileKeys, description: "Memory file to update" },
          operation: { type: "string", enum: ["append", "replace", "update_section"], description: "Type of update" },
          content: { type: "string", description: "Content to add/update" },
          section: { type: "string", description: "Section header to update (for update_section operation)" },
        },
      },
    },
    {
      name: "memory_log_decision",
      description: "Log a structured architectural decision with confidence tracking. Returns: { status, summary, metadata: { file, title, temporal_entry } }",
      inputSchema: toJsonSchema(MemoryLogDecisionSchema, ["title", "what", "why"]),
    },
    {
      name: "memory_log_lesson",
      description: "Log a bug fix, pattern, or anti-pattern with validation tracking. Returns: { status, summary, metadata: { file, title, temporal_entry } }",
      inputSchema: toJsonSchema(MemoryLogLessonSchema, ["category", "type", "title"]),
    },
    {
      name: "memory_snapshot",
      description: "Create a backup snapshot of all memory files with confidence data.",
      inputSchema: toJsonSchema(MemorySnapshotSchema),
    },
    {
      name: "get_context_summary",
      description: "Get compressed project state summary with confidence filtering.",
      inputSchema: toJsonSchema(ContextSummarySchema),
    },
    {
      name: "memory_history",
      description: "Get git history of a memory file with confidence evolution.",
      inputSchema: {
        ...toJsonSchema(MemoryHistorySchema, ["file"]),
        properties: {
          file: { type: "string", enum: fileKeys, description: "Memory file" },
          limit: { type: "number", description: "Number of commits (default: 10)" },
        },
      },
    },
    {
      name: "memory_rollback",
      description: "Rollback a memory file to a previous commit. Preserves confidence metadata.",
      inputSchema: {
        ...toJsonSchema(MemoryRollbackSchema, ["file", "commit_hash"]),
        properties: {
          file: { type: "string", enum: fileKeys, description: "Memory file" },
          commit_hash: { type: "string", description: "Git commit hash from memory_history" },
        },
      },
    },
    {
      name: "memory_diff",
      description: "Show what changed in a memory file including confidence changes.",
      inputSchema: {
        ...toJsonSchema(MemoryDiffSchema, ["file"]),
        properties: {
          file: { type: "string", enum: fileKeys, description: "Memory file" },
          commit_hash: { type: "string", description: "Compare to specific commit" },
        },
      },
    },
    {
      name: "reindex_memory",
      description: "Rebuild semantic search index and sync temporal metadata from markdown.",
      inputSchema: toJsonSchema(ReindexMemorySchema),
    },
    {
      name: "show_locks",
      description: "Show currently locked files and queue status (for debugging).",
      inputSchema: { type: "object" as const, properties: {} },
    },
    {
      name: "validate_memory",
      description: "Validate a memory entry to boost its confidence score.",
      inputSchema: toJsonSchema(ValidateMemorySchema, ["entry_id"]),
    },
    {
      name: "memory_health_report",
      description: "Get confidence distribution, alerts, and health score for all memory entries.",
      inputSchema: { type: "object" as const, properties: {} },
    },
    {
      name: "detect_contradictions",
      description: "Find contradictory memory entries using semantic similarity analysis.",
      inputSchema: toJsonSchema(DetectContradictionsSchema),
    },
    {
      name: "suggest_pruning",
      description: "Get dry-run recommendations for archiving low-confidence entries.",
      inputSchema: toJsonSchema(SuggestPruningSchema),
    },
    {
      name: "apply_pruning",
      description: "Archive low-confidence entries. Requires entry IDs from suggest_pruning.",
      inputSchema: toJsonSchema(ApplyPruningSchema, ["entry_ids"]),
    },
    {
      name: "resolve_contradiction",
      description: "Atomically resolve a contradiction: archive one entry, boost the other's confidence, and log the rationale. All in a single transaction.",
      inputSchema: toJsonSchema(ResolveContradictionSchema, ["entry_id_to_keep", "entry_id_to_archive", "resolution_rationale"]),
    },
    {
      name: "memory_undo",
      description: "Undo recent memory operations using git rollback. Max 10 steps.",
      inputSchema: toJsonSchema(MemoryUndoSchema),
    },
    {
      name: "import_research_analysis",
      description: "Import markdown analysis from Claude Sonnet research session. Intelligently parses sections and structures into memory categories. Handles variable markdown formats.",
      inputSchema: toJsonSchema(ImportResearchSchema, ["markdown_content", "title"]),
    },
    {
      name: "get_research_context",
      description: "Get specific research sections for implementation. Returns full content (no summaries) for use in Copilot prompts.",
      inputSchema: toJsonSchema(GetResearchContextSchema, ["research_id"]),
    },
    {
      name: "memory_ingest_url",
      description: "Fetch a URL (documentation, API reference, article), convert HTML to markdown, and store as a research entry in temporal memory. Enables autonomous learning of new libraries and APIs.",
      inputSchema: toJsonSchema(IngestUrlSchema, ["url", "title"]),
    },
  ];
}
