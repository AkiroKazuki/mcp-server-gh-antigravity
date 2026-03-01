/**
 * Antigravity OS v2.1 - Copilot Server Zod Schemas
 * Single source of truth for tool input validation and JSON schema generation.
 */

import { z } from "zod";

// --- Tool Schemas ---

export const GeneratePromptSchema = z.object({
  skill_file: z.string().describe("Skill template file (relative to .memory/prompts/templates/)"),
  requirements: z.string().describe("What you need from Copilot"),
  target_file: z.string().optional().describe("File to generate code for"),
  context_files: z.array(z.string()).optional().describe("Additional files to include as context"),
  max_context_depth: z.number().optional().describe("Import resolution depth (default: 1)"),
});

export const ExecuteSchema = z.object({
  prompt_file: z.string().describe("Generated prompt file to execute"),
  output_file: z.string().describe("Where to save the result"),
  task_id: z.string().optional().describe("Unique task ID for loop detection"),
  use_cache: z.boolean().optional().describe("Use response cache (default: true)"),
});

export const ValidateSchema = z.object({
  file: z.string().describe("File to validate"),
  requirements: z.array(z.string()).optional().describe("Specific requirements to check"),
});

export const ScoreSchema = z.object({
  file: z.string().describe("Generated file to score"),
  prompt_file: z.string().optional().describe("Original prompt file"),
  skill_file: z.string().optional().describe("Skill file used (for effectiveness tracking)"),
});

export const BatchExecuteSchema = z.object({
  prompts: z.array(z.object({
    prompt_file: z.string(),
    output_file: z.string(),
    task_id: z.string().optional(),
  })).describe("Array of prompt/output pairs"),
});

export const PreviewSchema = z.object({
  prompt_file: z.string().describe("Generated prompt file"),
  target_file: z.string().optional().describe("Existing file to diff against"),
});

export const GetContextSchema = z.object({
  target_file: z.string().describe("File to gather context for"),
  max_depth: z.number().optional().describe("Import resolution depth (default: 1)"),
  include_types: z.boolean().optional().describe("Include type definitions (default: true)"),
  include_git_diff: z.boolean().optional().describe("Include recent git changes (default: true)"),
  signatures_only: z.boolean().optional().describe("Use AST to return only exported signatures from dependencies (default: true)"),
});

export const CacheClearSchema = z.object({
  scope: z.enum(["all", "expired", "today"]).optional().describe("Scope of cache to clear"),
});

export const AnalyzeFailureSchema = z.object({
  prompt_file: z.string().describe("Prompt file that produced bad output"),
  output_file: z.string().optional().describe("The bad output file"),
  validation_errors: z.array(z.string()).optional().describe("Validation errors if any"),
  expected: z.string().optional().describe("What was expected"),
});

export const SuggestSkillUpdateSchema = z.object({
  prompt_file: z.string().describe("Failed prompt file"),
  skill_file: z.string().describe("Skill file to update"),
  output_file: z.string().optional().describe("Failed output file"),
  validation_errors: z.array(z.string()).optional().describe("Validation errors"),
});

export const ExecuteAndValidateSchema = z.object({
  prompt_file: z.string().describe("Path to prompt file (from copilot_generate_prompt)"),
  output_file: z.string().describe("Where to save generated code"),
  requirements: z.array(z.string()).optional().describe("Requirements to validate (e.g., ['Type hints', 'Handle None values'])"),
  auto_approve_if_valid: z.boolean().optional().describe("Automatically accept if validation passes (default: false)"),
  max_retries: z.number().int().min(0).max(5).optional().describe("Max auto-heal retries on validation failure (default: 3, 0 to disable)"),
});

export const ImplementWithResearchSchema = z.object({
  research_id: z.string().describe("Research ID from import_research_analysis"),
  research_section: z.string().optional().describe("Specific section (e.g., 'implementation', 'findings')"),
  specific_topic: z.string().optional().describe("Optional: Specific topic from section (e.g., 'entry rules')"),
  task_description: z.string().describe("What to implement (e.g., 'Bollinger Band entry signal')"),
  file_path: z.string().describe("Output file path"),
  function_signature: z.string().optional().describe("Complete function signature with types"),
  requirements: z.array(z.string()).optional().describe("Additional requirements"),
});

// --- Types inferred from schemas ---

export type GeneratePromptArgs = z.infer<typeof GeneratePromptSchema>;
export type ExecuteArgs = z.infer<typeof ExecuteSchema>;
export type ValidateArgs = z.infer<typeof ValidateSchema>;
export type ScoreArgs = z.infer<typeof ScoreSchema>;
export type BatchExecuteArgs = z.infer<typeof BatchExecuteSchema>;
export type PreviewArgs = z.infer<typeof PreviewSchema>;
export type GetContextArgs = z.infer<typeof GetContextSchema>;
export type CacheClearArgs = z.infer<typeof CacheClearSchema>;
export type AnalyzeFailureArgs = z.infer<typeof AnalyzeFailureSchema>;
export type SuggestSkillUpdateArgs = z.infer<typeof SuggestSkillUpdateSchema>;
export type ExecuteAndValidateArgs = z.infer<typeof ExecuteAndValidateSchema>;
export type ImplementWithResearchArgs = z.infer<typeof ImplementWithResearchSchema>;

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

export function getCopilotToolDefinitions() {
  return [
    {
      name: "copilot_generate_prompt",
      description: "Build a structured AI prompt from a skill template with multi-file context injection.",
      inputSchema: toJsonSchema(GeneratePromptSchema, ["skill_file", "requirements"]),
    },
    {
      name: "copilot_execute",
      description: "Save generated code to file with response caching and validation.",
      inputSchema: toJsonSchema(ExecuteSchema, ["prompt_file", "output_file"]),
    },
    {
      name: "copilot_validate",
      description: "Validate generated code for security, quality, and trading patterns.",
      inputSchema: toJsonSchema(ValidateSchema, ["file"]),
    },
    {
      name: "copilot_score",
      description: "Score a Copilot output for relevance, correctness, and quality.",
      inputSchema: toJsonSchema(ScoreSchema, ["file"]),
    },
    {
      name: "copilot_batch_execute",
      description: "Execute multiple prompts with conflict detection.",
      inputSchema: toJsonSchema(BatchExecuteSchema, ["prompts"]),
    },
    {
      name: "copilot_preview",
      description: "Preview what a prompt would generate without saving. Shows enhanced diff.",
      inputSchema: toJsonSchema(PreviewSchema, ["prompt_file"]),
    },
    {
      name: "copilot_get_context",
      description: "Gather multi-file context for a target file (imports, types, signatures, git changes).",
      inputSchema: toJsonSchema(GetContextSchema, ["target_file"]),
    },
    {
      name: "copilot_cache_clear",
      description: "Clear the response cache.",
      inputSchema: toJsonSchema(CacheClearSchema),
    },
    {
      name: "copilot_cache_stats",
      description: "Get cache hit/miss statistics.",
      inputSchema: { type: "object" as const, properties: {} },
    },
    {
      name: "analyze_failure",
      description: "Analyze why a Copilot prompt failed (read-only diagnosis).",
      inputSchema: toJsonSchema(AnalyzeFailureSchema, ["prompt_file"]),
    },
    {
      name: "suggest_skill_update",
      description: "Propose changes to a skill file based on failure analysis (requires approval).",
      inputSchema: toJsonSchema(SuggestSkillUpdateSchema, ["prompt_file", "skill_file"]),
    },
    {
      name: "copilot_execute_and_validate",
      description: "Execute GitHub Copilot CLI with prompt file, save output, and validate. AUTOMATICALLY runs 'gh copilot -p' - no manual terminal commands needed. Returns validation results.",
      inputSchema: toJsonSchema(ExecuteAndValidateSchema, ["prompt_file", "output_file"]),
    },
    {
      name: "implement_with_research_context",
      description: "Complete workflow: Load research context → Generate prompt → Execute Copilot → Validate → Link to research. One tool call for research-based implementation.",
      inputSchema: toJsonSchema(ImplementWithResearchSchema, ["research_id", "task_description", "file_path"]),
    },
  ];
}
