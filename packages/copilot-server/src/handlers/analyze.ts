import fs from "node:fs/promises";
import path from "node:path";
import { respond, respondError } from "@antigravity-os/shared";
import type { CopilotContext } from "./types.js";
import type { ValidateArgs, ScoreArgs, AnalyzeFailureArgs, SuggestSkillUpdateArgs } from "../schemas.js";

const PROJECT_ROOT = process.env.PROJECT_ROOT || process.cwd();

export async function handleValidate(ctx: CopilotContext, args: ValidateArgs) {
  const { file, requirements } = args;

  const filePath = path.isAbsolute(file) ? file : path.join(PROJECT_ROOT, file);
  let content: string;
  try {
    content = await fs.readFile(filePath, "utf-8");
  } catch {
    return respondError(`File not found: ${file}`);
  }

  const result = ctx.validator.validate(content, requirements);

  return respond({
    status: "success",
    operation: "copilot_validate",
    summary: result.valid
      ? `Validation passed (security: ${result.security_score}/100, quality: ${result.quality_score}/100)`
      : `Validation FAILED — ${result.issues.filter((i) => i.severity === "critical").length} critical issues`,
    metadata: {
      file,
      valid: result.valid,
      security_score: result.security_score,
      quality_score: result.quality_score,
      issues: result.issues,
      issue_count: result.issues.length,
      critical_count: result.issues.filter((i) => i.severity === "critical").length,
    },
    ...(result.issues.length > 0 ? {
      warnings: result.issues.filter((i) => i.severity === "critical").map((i) => `Line ${i.line || "?"}: ${i.message}`),
    } : {}),
  });
}

export async function handleScore(ctx: CopilotContext, args: ScoreArgs) {
  const { file, prompt_file: promptFile, skill_file: skillFile } = args;

  const filePath = path.isAbsolute(file) ? file : path.join(PROJECT_ROOT, file);
  let content: string;
  try {
    content = await fs.readFile(filePath, "utf-8");
  } catch {
    return respondError(`File not found: ${file}`);
  }

  // Validate for scores
  const validation = ctx.validator.validate(content);
  const lines = content.split("\n");
  const nonEmpty = lines.filter((l) => l.trim()).length;
  const codeLines = lines.filter((l) => l.trim() && !l.startsWith("//") && !l.startsWith("#")).length;

  // Heuristic scoring
  const relevance = Math.min(100, Math.max(20, codeLines > 5 ? 70 : 30));
  const correctness = validation.valid ? 80 : 40;
  const quality = validation.quality_score;
  const security = validation.security_score;
  const overall = Math.round((relevance + correctness + quality + security) / 4);

  // Log score to SQLite for cross-process safe skill effectiveness tracking
  try {
    ctx.db.prepare(
      `INSERT INTO scores (timestamp, file, skill_file, prompt_file, overall, relevance, correctness, quality, security)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(new Date().toISOString(), file, skillFile || null, promptFile || null, overall, relevance, correctness, quality, security);
  } catch { /* ignore */ }

  return respond({
    status: "success",
    operation: "copilot_score",
    summary: `Score: ${overall}/100 (R:${relevance} C:${correctness} Q:${quality} S:${security})`,
    metadata: {
      file,
      overall,
      relevance,
      correctness,
      quality,
      security,
      lines: { total: lines.length, code: codeLines, non_empty: nonEmpty },
      skill_file: skillFile || null,
      issues: validation.issues.length,
    },
  });
}

export async function handleAnalyzeFailure(ctx: CopilotContext, args: AnalyzeFailureArgs) {
  const { prompt_file: promptFile, output_file: outputFile, validation_errors: validationErrors, expected } = args;

  const promptPath = path.isAbsolute(promptFile) ? promptFile : path.join(ctx.memoryPath, promptFile);
  const outputPath = outputFile
    ? (path.isAbsolute(outputFile) ? outputFile : path.join(PROJECT_ROOT, outputFile))
    : undefined;

  const analysis = await ctx.failureAnalyzer.analyze(
    promptPath,
    outputPath,
    validationErrors,
    expected
  );

  return respond({
    status: "success",
    operation: "analyze_failure",
    summary: `Failure category: ${analysis.category} (confidence: ${analysis.confidence})`,
    metadata: analysis,
    next_steps: [
      ...analysis.suggested_prompt_improvements.slice(0, 3),
      "Use suggest_skill_update to propose skill file changes",
    ],
  });
}

export async function handleSuggestSkillUpdate(ctx: CopilotContext, args: SuggestSkillUpdateArgs) {
  const { prompt_file: promptFile, skill_file: skillFile, output_file: outputFile, validation_errors: validationErrors } = args;

  const promptPath = path.isAbsolute(promptFile) ? promptFile : path.join(ctx.memoryPath, promptFile);
  const outputPath = outputFile
    ? (path.isAbsolute(outputFile) ? outputFile : path.join(PROJECT_ROOT, outputFile))
    : undefined;

  // First analyze the failure
  const analysis = await ctx.failureAnalyzer.analyze(promptPath, outputPath, validationErrors);

  // Then suggest skill updates
  const skillPath = path.join(ctx.skillsDir, skillFile);
  const suggestion = await ctx.failureAnalyzer.suggestSkillUpdate(analysis, skillPath);

  return respond({
    status: "success",
    operation: "suggest_skill_update",
    summary: `Skill update suggestion for ${skillFile} (priority: ${suggestion.priority})`,
    metadata: {
      analysis_category: analysis.category,
      suggestion,
    },
    warnings: [
      "This is a SUGGESTION only. Review and approve before applying changes.",
      "Use memory_update to apply approved changes to the skill file.",
    ],
  });
}
