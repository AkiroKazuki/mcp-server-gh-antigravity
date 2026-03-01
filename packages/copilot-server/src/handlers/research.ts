import fs from "node:fs/promises";
import path from "node:path";
import { respond, respondError } from "@antigravity-os/shared";
import type { CopilotContext } from "./types.js";
import type { ImplementWithResearchArgs } from "../schemas.js";

const PROJECT_ROOT = process.env.PROJECT_ROOT || process.cwd();

export async function handleImplementWithResearch(ctx: CopilotContext, args: ImplementWithResearchArgs) {
  const { research_id: researchId, task_description: taskDescription, file_path: filePath } = args;
  const researchSection = args.research_section;
  const specificTopic = args.specific_topic;
  const functionSignature = args.function_signature;
  const requirements = args.requirements ?? [];

  const steps: Array<{ step: string; [key: string]: unknown }> = [];

  // Step 1: Get research context
  let researchContext;
  try {
    researchContext = await ctx.researchIntegration.getResearchContext({
      research_id: researchId,
      sections: researchSection ? [researchSection] : undefined,
      specific_topic: specificTopic,
    });
    steps.push({ step: "research_loaded", sections: Object.keys(researchContext.content) });
  } catch (error: any) {
    return respondError(`Failed to load research ${researchId}: ${error.message}`);
  }

  // Step 2: Build prompt with research context
  const researchPrompt = ctx.researchIntegration.buildResearchPromptSection(researchContext);
  const additionalContext = await ctx.researchIntegration.getAdditionalContext();

  const promptParts = [
    `# Implementation Task`,
    `## Task: ${taskDescription}`,
    "",
    functionSignature ? `## Function Signature\n\`\`\`\n${functionSignature}\n\`\`\`\n` : "",
    requirements.length > 0 ? `## Requirements\n${requirements.map((r) => `- ${r}`).join("\n")}\n` : "",
    researchPrompt,
    additionalContext.tech_stack ? `## Tech Stack\n${additionalContext.tech_stack.slice(0, 2000)}\n` : "",
    additionalContext.lessons ? `## Relevant Lessons\n${additionalContext.lessons.slice(0, 1000)}\n` : "",
  ].filter(Boolean).join("\n");

  // Save prompt
  await fs.mkdir(ctx.generatedDir, { recursive: true });
  const promptFileName = `prompt_research_${Date.now()}.md`;
  const promptPath = path.join(ctx.generatedDir, promptFileName);
  await fs.writeFile(promptPath, promptParts, "utf-8");
  steps.push({ step: "prompt_generated", file: path.relative(ctx.memoryPath, promptPath) });

  // Step 3: Execute and validate
  const executionResult = await ctx.cliExecutor.execute(promptParts);

  const outPath = path.isAbsolute(filePath) ? filePath : path.join(PROJECT_ROOT, filePath);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, executionResult.code, "utf-8");

  const validation = ctx.validator.validate(executionResult.code, requirements);
  steps.push({
    step: "executed",
    source: executionResult.source,
    lines: executionResult.lines_generated,
    validation_passed: validation.valid,
  });

  // Step 4: Link to research if valid
  if (validation.valid) {
    await ctx.researchIntegration.addResearchLink(outPath, researchId, researchContext.title);
    steps.push({ step: "linked_to_research" });

    // Cache the result
    const cacheKey = ctx.cache.generateKey(promptParts, filePath);
    ctx.cache.set(cacheKey, executionResult.code, {
      research_id: researchId,
      source: executionResult.source,
    });
  }

  return respond({
    status: validation.valid ? "complete" : "needs_review",
    operation: "implement_with_research_context",
    summary: validation.valid
      ? `Implemented "${taskDescription}" using research "${researchContext.title}" (${executionResult.lines_generated} lines)`
      : `Generated code needs review for "${taskDescription}"`,
    metadata: {
      file: filePath,
      research: {
        id: researchId,
        title: researchContext.title,
        source: researchContext.source,
      },
      validation: {
        passed: validation.valid,
        issues: validation.issues,
        security_score: validation.security_score,
        quality_score: validation.quality_score,
        recommendation: validation.valid ? "APPROVE" : "REVIEW_REQUIRED",
      },
      execution: {
        source: executionResult.source,
        lines_generated: executionResult.lines_generated,
        execution_time_ms: executionResult.execution_time_ms,
      },
      steps,
    },
  });
}
