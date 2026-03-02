import fs from "node:fs/promises";
import path from "node:path";
import { respond, respondError } from "@antigravity-os/shared";
import type { CopilotContext } from "./types.js";
import type { GeneratePromptArgs, PreviewArgs } from "../schemas.js";

const PROJECT_ROOT = process.env.PROJECT_ROOT || process.cwd();

export async function handleGeneratePrompt(ctx: CopilotContext, args: GeneratePromptArgs) {
  const { skill_file: skillFile, requirements, target_file: targetFile } = args;
  const contextFiles = args.context_files ?? [];
  const maxContextDepth = args.max_context_depth ?? 1;

  // Load skill template
  const skillPath = path.join(ctx.skillsDir, skillFile);
  let skillContent: string;
  try {
    skillContent = await fs.readFile(skillPath, "utf-8");
  } catch {
    return respondError(`Skill file not found: ${skillFile}. Create it in ${ctx.skillsDir}/`);
  }

  // Build context section
  let context = "";
  if (targetFile) {
    try {
      context = await ctx.contextGatherer.gatherContext(targetFile, {
        maxDepth: maxContextDepth,
        includeTypes: true,
        includeGitDiff: true,
      });
    } catch (err: any) {
      context = `[Context gathering failed: ${err.message}]`;
    }
  }

  // Add explicit context files
  for (const cf of contextFiles) {
    const cfPath = path.isAbsolute(cf) ? cf : path.join(PROJECT_ROOT, cf);
    try {
      const cfContent = await fs.readFile(cfPath, "utf-8");
      context += `\n\n## Additional Context: ${path.basename(cf)}\n\`\`\`\n${cfContent.slice(0, 3000)}\n\`\`\`\n`;
    } catch { /* skip missing */ }
  }

  // Assemble prompt
  const timestamp = new Date().toISOString();
  const prompt = [
    `# Generated Prompt — ${timestamp}`,
    `## Skill: ${skillFile}`,
    "",
    skillContent,
    "",
    "## Requirements",
    requirements,
    "",
    targetFile ? `## Target File: ${targetFile}` : "",
    context ? `## Context\n${context}` : "",
  ].filter(Boolean).join("\n");

  // Save generated prompt
  await fs.mkdir(ctx.generatedDir, { recursive: true });
  const promptFileName = `prompt_${Date.now()}.md`;
  const promptPath = path.join(ctx.generatedDir, promptFileName);
  await fs.writeFile(promptPath, prompt, "utf-8");

  return respond({
    status: "success",
    operation: "copilot_generate_prompt",
    summary: `Generated prompt from ${skillFile} (${prompt.length} chars)`,
    metadata: {
      prompt_file: path.relative(ctx.memoryPath, promptPath),
      skill_file: skillFile,
      prompt_length: prompt.length,
      has_context: context.length > 0,
      context_files: contextFiles.length,
      target_file: targetFile || null,
    },
  });
}

export async function handlePreview(ctx: CopilotContext, args: PreviewArgs) {
  const { prompt_file: promptFile, target_file: targetFile } = args;

  const promptPath = path.isAbsolute(promptFile) ? promptFile : path.join(ctx.memoryPath, promptFile);
  let promptContent: string;
  try {
    promptContent = await fs.readFile(promptPath, "utf-8");
  } catch {
    return respondError(`Prompt file not found: ${promptFile}`);
  }

  let existingContent = "";
  if (targetFile) {
    const targetPath = path.isAbsolute(targetFile) ? targetFile : path.join(PROJECT_ROOT, targetFile);
    try {
      existingContent = await fs.readFile(targetPath, "utf-8");
    } catch { /* no existing file */ }
  }

  return respond({
    status: "success",
    operation: "copilot_preview",
    summary: `Preview for ${promptFile}${targetFile ? ` (diff against ${targetFile})` : ""}`,
    metadata: {
      prompt_file: promptFile,
      prompt_preview: promptContent.slice(0, 2000),
      prompt_length: promptContent.length,
      target_file: targetFile || null,
      existing_content_length: existingContent.length,
      has_existing: existingContent.length > 0,
    },
  });
}
