/**
 * Antigravity OS v2.1 - Research Integration
 * Injects research context into Copilot prompts and links
 * generated code back to source research.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { Logger } from "@antigravity-os/shared";

const log = new Logger("research-integration");

export interface ResearchContext {
  research_id: string;
  title: string;
  source: string;
  tags: string[];
  content: Record<string, string>;
  full_content_length: number;
}

export class ResearchIntegration {
  constructor(
    private memoryPath: string,
    private projectRoot: string,
  ) { }

  /**
   * Read research context for a given research ID.
   * Delegates to the same logic as research-importer but is usable from copilot-server.
   */
  async getResearchContext(args: {
    research_id: string;
    sections?: string[];
    specific_topic?: string;
  }): Promise<ResearchContext> {
    const { research_id, sections, specific_topic } = args;
    const researchDir = path.join(this.memoryPath, "research", "analyses", research_id);

    const metaRaw = await fs.readFile(path.join(researchDir, "metadata.json"), "utf-8");
    const metadata = JSON.parse(metaRaw);

    const sectionsToRead: string[] = sections || metadata.sections || [];
    const content: Record<string, string> = {};

    for (const section of sectionsToRead) {
      const sectionPath = path.join(researchDir, `${section}.md`);
      try {
        let sectionContent = await fs.readFile(sectionPath, "utf-8");

        if (specific_topic) {
          sectionContent = this.extractRelevantContent(sectionContent, specific_topic);
        }

        if (sectionContent.trim()) {
          content[section] = sectionContent;
        }
      } catch {
        // Section file doesn't exist, skip
      }
    }

    return {
      research_id,
      title: metadata.title,
      source: metadata.source,
      tags: metadata.tags,
      content,
      full_content_length: Object.values(content).join("\n").length,
    };
  }

  /**
   * Build a prompt section injecting research context.
   */
  buildResearchPromptSection(context: ResearchContext): string {
    const parts: string[] = [
      `## Research Context`,
      `**Research:** ${context.title}`,
      `**Source:** ${context.source}`,
      `**Tags:** ${context.tags.join(", ")}`,
      "",
    ];

    for (const [section, content] of Object.entries(context.content)) {
      parts.push(`### ${section}`);
      parts.push(content);
      parts.push("");
    }

    return parts.join("\n");
  }

  /**
   * Add a research link comment header to a generated code file.
   */
  async addResearchLink(
    filePath: string,
    researchId: string,
    researchTitle: string,
  ): Promise<void> {
    const absPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.projectRoot, filePath);

    let code: string;
    try {
      code = await fs.readFile(absPath, "utf-8");
    } catch {
      log.warn("Could not read file for research link", { filePath });
      return;
    }

    const header = [
      `# Based on research: .memory/research/analyses/${researchId}/`,
      `# Research: "${researchTitle}"`,
      `#`,
      "",
    ].join("\n");

    await fs.writeFile(absPath, header + code, "utf-8");

    log.info("Added research link to file", { filePath, researchId });
  }

  /**
   * Read tech stack and recent lessons from memory for prompt context.
   */
  async getAdditionalContext(): Promise<{
    tech_stack: string | null;
    lessons: string | null;
  }> {
    let tech_stack: string | null = null;
    let lessons: string | null = null;

    try {
      tech_stack = await fs.readFile(
        path.join(this.memoryPath, "core", "tech_stack.md"),
        "utf-8",
      );
    } catch { /* skip */ }

    try {
      const content = await fs.readFile(
        path.join(this.memoryPath, "lessons", "best_practices.md"),
        "utf-8",
      );
      // Return last 50 lines to keep it focused
      const lines = content.split("\n");
      lessons = lines.slice(-50).join("\n");
    } catch { /* skip */ }

    return { tech_stack, lessons };
  }

  private extractRelevantContent(content: string, topic: string): string {
    const topicLower = topic.toLowerCase();
    const topicWords = topicLower.split(/\s+/);
    const paragraphs = content.split(/\n\n+/);

    const relevant = paragraphs.filter((p) => {
      const pLower = p.toLowerCase();
      return topicWords.some((word) => pLower.includes(word));
    });

    return relevant.length > 0 ? relevant.join("\n\n") : content;
  }
}
