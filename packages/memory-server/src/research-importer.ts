/**
 * Antigravity OS v2.1 - Research Importer
 * Parses markdown from Claude Sonnet research sessions into structured sections.
 * Handles variable markdown formats with intelligent section detection.
 */

import fs from "node:fs/promises";
import path from "node:path";

export interface ParsedSection {
  title: string;
  content: string;
}

export interface ResearchMetadata {
  id: string;
  title: string;
  source: string;
  tags: string[];
  imported_at: string;
  sections: string[];
  confidence: number;
  validation_count: number;
  contradiction_count: number;
  outcomes: ResearchOutcome[];
}

export interface ResearchOutcome {
  file: string;
  outcome: "success" | "partial" | "failed";
  metrics: Record<string, unknown>;
  logged_at: string;
}

const SECTION_PATTERNS: Record<string, string[]> = {
  summary: ["executive summary", "summary", "overview", "abstract", "tldr", "tl;dr"],
  findings: ["key findings", "findings", "results", "conclusions", "key results", "main findings"],
  implementation: ["implementation", "strategy", "methodology", "approach", "algorithm", "method"],
  performance: ["performance", "expected results", "metrics", "returns", "backtest", "expected performance"],
  risks: ["risks", "limitations", "considerations", "warnings", "caveats", "drawbacks"],
};

export class ResearchImporter {
  constructor(private memoryPath: string) { }

  /**
   * Generate a filesystem-safe research ID from the title.
   * Format: YYYY-MM-slug (e.g., "2024-02-mean-reversion-bb")
   */
  generateResearchId(title: string): string {
    const now = new Date();
    const datePrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 40)
      .replace(/-+$/, "");
    return `${datePrefix}-${slug}`;
  }

  /**
   * Parse markdown content into titled sections.
   * Detects H1 and H2 headers as section boundaries.
   */
  parseMarkdownSections(markdown: string): ParsedSection[] {
    const sections: ParsedSection[] = [];
    const lines = markdown.split("\n");
    let currentSection: string | null = null;
    let currentContent: string[] = [];

    for (const line of lines) {
      const headerMatch = line.match(/^#{1,2}\s+(.+)$/);

      if (headerMatch) {
        if (currentSection) {
          sections.push({
            title: currentSection,
            content: currentContent.join("\n").trim(),
          });
        }
        currentSection = headerMatch[1];
        currentContent = [];
      } else if (currentSection) {
        currentContent.push(line);
      }
    }

    // Save last section
    if (currentSection) {
      sections.push({
        title: currentSection,
        content: currentContent.join("\n").trim(),
      });
    }

    return sections;
  }

  /**
   * Map parsed sections to known category files based on pattern matching.
   * Returns mapped sections and unmapped sections separately.
   */
  categorizeSections(sections: ParsedSection[]): {
    mapped: Record<string, string>;
    unmapped: ParsedSection[];
  } {
    const mapped: Record<string, string> = {};
    const usedSections = new Set<ParsedSection>();

    for (const [category, patterns] of Object.entries(SECTION_PATTERNS)) {
      for (const section of sections) {
        if (usedSections.has(section)) continue;
        const titleLower = section.title.toLowerCase();
        if (patterns.some((p) => titleLower.includes(p))) {
          mapped[category] = section.content;
          usedSections.add(section);
          break;
        }
      }
    }

    const unmapped = sections.filter((s) => !usedSections.has(s));
    return { mapped, unmapped };
  }

  /**
   * Convert a section title to a safe filename.
   */
  sanitizeFilename(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 50)
      .replace(/_+$/, "");
  }

  /**
   * Import a full research analysis from markdown.
   * Creates a structured directory with categorized sections and metadata.
   */
  async importResearch(args: {
    markdown_content: string;
    title: string;
    tags?: string[];
    source?: string;
  }): Promise<{
    researchId: string;
    researchDir: string;
    sections: string[];
    metadata: ResearchMetadata;
  }> {
    const { markdown_content, title, tags = [], source } = args;

    const researchId = this.generateResearchId(title);
    const researchDir = path.join(this.memoryPath, "research", "analyses", researchId);
    await fs.mkdir(researchDir, { recursive: true });

    // Parse and categorize
    const parsed = this.parseMarkdownSections(markdown_content);
    const { mapped, unmapped } = this.categorizeSections(parsed);

    // Write categorized section files
    for (const [category, content] of Object.entries(mapped)) {
      await fs.writeFile(path.join(researchDir, `${category}.md`), content, "utf-8");
    }

    // Write unmapped sections with sanitized filenames
    for (const section of unmapped) {
      const filename = this.sanitizeFilename(section.title);
      if (filename) {
        await fs.writeFile(path.join(researchDir, `${filename}.md`), section.content, "utf-8");
      }
    }

    // Save the full original markdown
    await fs.writeFile(path.join(researchDir, "full_analysis.md"), markdown_content, "utf-8");

    // Create metadata
    const metadata: ResearchMetadata = {
      id: researchId,
      title,
      source: source || "Unknown",
      tags,
      imported_at: new Date().toISOString(),
      sections: Object.keys(mapped),
      confidence: 1.0,
      validation_count: 0,
      contradiction_count: 0,
      outcomes: [],
    };

    await fs.writeFile(
      path.join(researchDir, "metadata.json"),
      JSON.stringify(metadata, null, 2),
      "utf-8"
    );

    return { researchId, researchDir, sections: Object.keys(mapped), metadata };
  }

  /**
   * Read research context for a given research ID.
   * Optionally filters by section list or specific topic.
   */
  async getResearchContext(args: {
    research_id: string;
    sections?: string[];
    specific_topic?: string;
  }): Promise<{
    research_id: string;
    title: string;
    source: string;
    tags: string[];
    content: Record<string, string>;
    full_content_length: number;
  }> {
    const { research_id, sections, specific_topic } = args;
    const researchDir = path.join(this.memoryPath, "research", "analyses", research_id);

    // Read metadata
    const metaRaw = await fs.readFile(path.join(researchDir, "metadata.json"), "utf-8");
    const metadata: ResearchMetadata = JSON.parse(metaRaw);

    // Determine which sections to read
    const sectionsToRead = sections || metadata.sections;
    const content: Record<string, string> = {};

    for (const section of sectionsToRead) {
      const sectionPath = path.join(researchDir, `${section}.md`);
      try {
        let sectionContent = await fs.readFile(sectionPath, "utf-8");

        // Filter by topic if requested
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

    const fullLength = Object.values(content).join("\n").length;

    return {
      research_id,
      title: metadata.title,
      source: metadata.source,
      tags: metadata.tags,
      content,
      full_content_length: fullLength,
    };
  }

  /**
   * Extract paragraphs relevant to a specific topic from content.
   * Uses simple keyword matching on paragraphs.
   */
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

  /**
   * Calculate research confidence based on outcomes.
   * success boosts, partial maintains, failed reduces.
   */
  calculateResearchConfidence(metadata: ResearchMetadata): number {
    if (metadata.outcomes.length === 0) return metadata.confidence;

    const successes = metadata.outcomes.filter((o) => o.outcome === "success").length;
    const failures = metadata.outcomes.filter((o) => o.outcome === "failed").length;
    const total = metadata.outcomes.length;

    // Base: 0.5, +0.5 scaled by success rate, -0.3 for failure rate
    const successRate = successes / total;
    const failureRate = failures / total;
    const confidence = Math.max(0.1, Math.min(1.0, 0.5 + successRate * 0.5 - failureRate * 0.3));

    return parseFloat(confidence.toFixed(2));
  }

  /**
   * List all imported research analyses.
   */
  async listResearch(): Promise<Array<{ id: string; title: string; confidence: number; imported_at: string }>> {
    const analysesDir = path.join(this.memoryPath, "research", "analyses");
    try {
      const entries = await fs.readdir(analysesDir, { withFileTypes: true });
      const results = [];

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        try {
          const metaRaw = await fs.readFile(
            path.join(analysesDir, entry.name, "metadata.json"),
            "utf-8"
          );
          const meta: ResearchMetadata = JSON.parse(metaRaw);
          results.push({
            id: meta.id,
            title: meta.title,
            confidence: meta.confidence,
            imported_at: meta.imported_at,
          });
        } catch {
          // Skip broken entries
        }
      }

      return results;
    } catch {
      return [];
    }
  }
}
