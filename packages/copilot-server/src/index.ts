#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs/promises";
import path from "node:path";
import { LoopDetector } from "./loop-detector.js";
import { validateCode, stripCliJunk } from "./cli-cleaner.js";

// --- Configuration ---

const PROJECT_ROOT = process.env.PROJECT_ROOT || process.cwd();
const SKILLS_DIR = process.env.SKILLS_DIR || ".skills";
const MEMORY_DIR = process.env.MEMORY_DIR || ".memory";
const MEMORY_PATH = path.join(PROJECT_ROOT, MEMORY_DIR);
const SKILLS_PATH = path.join(PROJECT_ROOT, SKILLS_DIR);

// --- Server ---

class CopilotServer {
  private server: Server;
  private loopDetector: LoopDetector;

  constructor() {
    this.server = new Server(
      { name: "antigravity-copilot", version: "1.0.0" },
      { capabilities: { tools: {}, prompts: {} } }
    );
    this.loopDetector = new LoopDetector();

    this.setupToolHandlers();
    this.setupPromptHandlers();

    this.server.onerror = (error) => {
      console.error("[copilot-server] Error:", error);
    };
  }

  private setupPromptHandlers() {
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => ({
      prompts: [
        {
          name: "efficiency_rules",
          description: "Token optimization guidelines for AI sessions",
        },
      ],
    }));

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      if (request.params.name === "efficiency_rules") {
        return {
          messages: [
            {
              role: "user" as const,
              content: {
                type: "text" as const,
                text: `EFFICIENCY RULES FOR THIS SESSION:
1. When delegating to Copilot, use SHORT commands only
2. Do NOT explain what you're doing unless there's a CRITICAL error
3. Return summaries, not full code (save user's tokens)
4. If something fails twice, stop and ask for manual intervention
5. Use batch operations when possible (copilot_batch_execute)
6. Read get_context_summary instead of full memory files
7. Always validate Copilot output before accepting

Token budget awareness: User pays per token for your outputs. Be concise.`,
              },
            },
          ],
        };
      }
      throw new Error(`Unknown prompt: ${request.params.name}`);
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "copilot_generate_prompt",
          description:
            "Generate an optimized prompt for GitHub Copilot CLI using templates and context from memory.",
          inputSchema: {
            type: "object" as const,
            properties: {
              intent: {
                type: "string",
                enum: [
                  "implement_function",
                  "fix_bug",
                  "refactor",
                  "write_tests",
                  "add_feature",
                ],
                description: "Type of task",
              },
              file_path: {
                type: "string",
                description: "Path to file to create/modify",
              },
              description: {
                type: "string",
                description: "What to implement",
              },
              function_signature: {
                type: "string",
                description: "Complete function signature with types",
              },
              edge_cases: {
                type: "array",
                items: { type: "string" },
                description: "Edge cases to handle",
              },
              context: {
                type: "object",
                properties: {
                  tech_stack: { type: "string" },
                  lessons: { type: "string" },
                  decisions: { type: "string" },
                },
                description: "Additional context from memory",
              },
            },
            required: ["intent", "file_path", "description"],
          },
        },
        {
          name: "copilot_execute",
          description:
            "Generate a shell command for running Copilot CLI with the prompt. Returns the command for manual execution.",
          inputSchema: {
            type: "object" as const,
            properties: {
              prompt_file: {
                type: "string",
                description: "Path to prompt file",
              },
              output_file: {
                type: "string",
                description: "Where Copilot should write output (optional)",
              },
            },
            required: ["prompt_file"],
          },
        },
        {
          name: "copilot_validate",
          description:
            "Validate a code file for security issues and quality problems.",
          inputSchema: {
            type: "object" as const,
            properties: {
              file_path: {
                type: "string",
                description: "File to validate",
              },
              requirements: {
                type: "array",
                items: { type: "string" },
                description: "Requirements from original prompt to check",
              },
            },
            required: ["file_path"],
          },
        },
        {
          name: "copilot_score",
          description:
            "Score a Copilot interaction for analytics and improvement tracking.",
          inputSchema: {
            type: "object" as const,
            properties: {
              prompt_file: {
                type: "string",
                description: "Path to the prompt file used",
              },
              output_file: {
                type: "string",
                description: "Path to the output file",
              },
              score: {
                type: "number",
                description: "Score 1-5 (5 = perfect)",
              },
              issues: {
                type: "string",
                description: "What went wrong (if score < 4)",
              },
            },
            required: ["prompt_file", "output_file", "score"],
          },
        },
        {
          name: "copilot_batch_execute",
          description:
            "Generate commands for multiple Copilot tasks. Detects file conflicts and organizes parallel vs sequential execution.",
          inputSchema: {
            type: "object" as const,
            properties: {
              tasks: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    prompt_file: { type: "string" },
                    output_file: { type: "string" },
                    priority: {
                      type: "string",
                      enum: ["high", "low"],
                    },
                  },
                  required: ["prompt_file", "output_file"],
                },
                description: "Array of tasks to execute",
              },
            },
            required: ["tasks"],
          },
        },
        {
          name: "copilot_preview",
          description:
            "Preview what a Copilot prompt will do. Shows the prompt content and target file info without executing.",
          inputSchema: {
            type: "object" as const,
            properties: {
              prompt_file: {
                type: "string",
                description: "Path to prompt file",
              },
              target_file: {
                type: "string",
                description: "File that would be modified",
              },
            },
            required: ["prompt_file", "target_file"],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      try {
        switch (name) {
          case "copilot_generate_prompt":
            return await this.handleGeneratePrompt(args);
          case "copilot_execute":
            return await this.handleExecute(args);
          case "copilot_validate":
            return await this.handleValidate(args);
          case "copilot_score":
            return await this.handleScore(args);
          case "copilot_batch_execute":
            return await this.handleBatchExecute(args);
          case "copilot_preview":
            return await this.handlePreview(args);
          default:
            return {
              content: [{ type: "text", text: `Unknown tool: ${name}` }],
              isError: true,
            };
        }
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    });
  }

  // --- Tool Handlers ---

  private async handleGeneratePrompt(args: any) {
    const { intent, file_path, description, function_signature, edge_cases, context } =
      args;

    // Try to load template
    const templatePath = path.join(
      MEMORY_PATH,
      "prompts",
      "templates",
      `${intent}.md`
    );
    let template: string;

    try {
      template = await fs.readFile(templatePath, "utf-8");
    } catch {
      // Generate a default template
      template = this.getDefaultTemplate(intent);
    }

    // Load skills for context
    let skillsContext = "";
    try {
      const skillsFile = path.join(SKILLS_PATH, "copilot_mastery.md");
      skillsContext = await fs.readFile(skillsFile, "utf-8");
    } catch {
      // No skills file, proceed without
    }

    // Substitute variables
    let prompt = template
      .replace(/\{filepath\}/g, file_path)
      .replace(/\{file_path\}/g, file_path)
      .replace(/\{description\}/g, description)
      .replace(/\{function_signature\}/g, function_signature || "N/A")
      .replace(
        /\{edge_cases_list\}/g,
        edge_cases?.map((e: string) => `- ${e}`).join("\n") || "N/A"
      )
      .replace(
        /\{tech_stack_summary\}/g,
        context?.tech_stack || "See .memory/core/tech_stack.md"
      )
      .replace(
        /\{relevant_patterns\}/g,
        context?.lessons || "See .memory/lessons/"
      )
      .replace(
        /\{requirements_list\}/g,
        description
      )
      .replace(/\{project_name\}/g, path.basename(PROJECT_ROOT));

    // Add skills context if available
    if (skillsContext) {
      prompt += `\n\n# Copilot Guidelines\n${skillsContext.slice(0, 500)}`;
    }

    // Save generated prompt
    const timestamp = Date.now();
    const generatedDir = path.join(MEMORY_PATH, "prompts", "generated");
    await fs.mkdir(generatedDir, { recursive: true });
    const promptFile = path.join(generatedDir, `task_${timestamp}.md`);
    await fs.writeFile(promptFile, prompt, "utf-8");

    const relPromptFile = path.relative(PROJECT_ROOT, promptFile);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            prompt_file: relPromptFile,
            intent,
            target_file: file_path,
            preview: prompt.slice(0, 200) + "...",
            command: `gh copilot suggest "$(cat ${relPromptFile})"`,
          }),
        },
      ],
    };
  }

  private async handleExecute(args: any) {
    const { prompt_file, output_file } = args;

    const taskId = `${prompt_file}:${output_file || "stdout"}`;
    this.loopDetector.checkLoop(taskId);

    // Resolve prompt file path
    const absPromptFile = path.isAbsolute(prompt_file)
      ? prompt_file
      : path.join(PROJECT_ROOT, prompt_file);

    let promptContent: string;
    try {
      promptContent = await fs.readFile(absPromptFile, "utf-8");
    } catch {
      return {
        content: [
          { type: "text", text: `Prompt file not found: ${prompt_file}` },
        ],
        isError: true,
      };
    }

    // Build the command for the user to run
    const escapedPath = prompt_file.replace(/"/g, '\\"');
    let command = `gh copilot suggest "$(cat ${escapedPath})"`;

    if (output_file) {
      command += ` > ${output_file.replace(/"/g, '\\"')}`;
    }

    this.loopDetector.reset(taskId);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            status: "command_ready",
            command,
            prompt_file,
            output_file: output_file || null,
            prompt_preview: promptContent.slice(0, 200) + "...",
            instructions:
              "Copy and run this command in your terminal. The prompt file has been saved.",
          }),
        },
      ],
    };
  }

  private async handleValidate(args: any) {
    const { file_path, requirements } = args;

    const absPath = path.isAbsolute(file_path)
      ? file_path
      : path.join(PROJECT_ROOT, file_path);

    let content: string;
    try {
      content = await fs.readFile(absPath, "utf-8");
    } catch {
      return {
        content: [
          { type: "text", text: `File not found: ${file_path}` },
        ],
        isError: true,
      };
    }

    const issues = validateCode(content);

    // Check requirements if provided
    const requirementResults: Array<{ requirement: string; met: boolean }> = [];
    if (requirements) {
      for (const req of requirements) {
        const reqLower = req.toLowerCase();
        const contentLower = content.toLowerCase();

        // Simple heuristic checks
        let met = false;
        if (reqLower.includes("type hint")) {
          met = content.includes("->") || content.includes(": str") || content.includes(": int");
        } else if (reqLower.includes("docstring")) {
          met = content.includes('"""') || content.includes("'''");
        } else if (reqLower.includes("test")) {
          met = content.includes("def test_") || content.includes("it(") || content.includes("describe(");
        } else {
          // Generic: check if any key terms from requirement appear in code
          const terms = reqLower.split(/\s+/).filter((t: string) => t.length > 3);
          met = terms.some((t: string) => contentLower.includes(t));
        }

        requirementResults.push({ requirement: req, met });
      }
    }

    const securityIssues = issues.filter((i) => i.type === "security");
    const qualityIssues = issues.filter((i) => i.type === "quality");
    const passed = securityIssues.length === 0;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              passed,
              recommendation: passed ? "APPROVE" : "REJECT",
              security_issues: securityIssues.length,
              quality_warnings: qualityIssues.length,
              issues: issues.map((i) => ({
                type: i.type,
                severity: i.severity,
                message: i.message,
                line: i.line,
              })),
              requirements_check: requirementResults,
              file: file_path,
              lines: content.split("\n").length,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  private async handleScore(args: any) {
    const { prompt_file, output_file, score, issues } = args;

    if (score < 1 || score > 5) {
      return {
        content: [{ type: "text", text: "Score must be between 1 and 5" }],
        isError: true,
      };
    }

    const entry = {
      timestamp: new Date().toISOString(),
      prompt_file,
      output_file,
      score,
      issues: issues || null,
      template: path.basename(prompt_file).replace(/task_\d+/, "template"),
    };

    const scoresFile = path.join(
      MEMORY_PATH,
      "snapshots",
      "prompt_scores.jsonl"
    );
    await fs.mkdir(path.dirname(scoresFile), { recursive: true });
    await fs.appendFile(scoresFile, JSON.stringify(entry) + "\n");

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            score,
            logged_to: "snapshots/prompt_scores.jsonl",
          }),
        },
      ],
    };
  }

  private async handleBatchExecute(args: any) {
    const tasks: Array<{
      prompt_file: string;
      output_file: string;
      priority?: string;
    }> = args.tasks;

    if (!tasks || tasks.length === 0) {
      return {
        content: [{ type: "text", text: "No tasks provided" }],
        isError: true,
      };
    }

    // Detect file conflicts
    const fileGroups = new Map<string, typeof tasks>();
    for (const task of tasks) {
      const key = path.resolve(PROJECT_ROOT, task.output_file);
      const group = fileGroups.get(key) || [];
      group.push(task);
      fileGroups.set(key, group);
    }

    const parallelTasks: typeof tasks = [];
    const sequentialGroups: (typeof tasks)[] = [];

    for (const [, fileTasks] of fileGroups) {
      if (fileTasks.length === 1) {
        parallelTasks.push(fileTasks[0]);
      } else {
        sequentialGroups.push(fileTasks);
      }
    }

    // Sort by priority
    parallelTasks.sort((a, b) =>
      a.priority === "high" && b.priority !== "high" ? -1 : 0
    );

    // Generate commands
    const commands: Array<{
      command: string;
      output_file: string;
      group: "parallel" | "sequential";
      order?: number;
    }> = [];

    for (const task of parallelTasks) {
      const escapedPrompt = task.prompt_file.replace(/"/g, '\\"');
      const escapedOutput = task.output_file.replace(/"/g, '\\"');
      commands.push({
        command: `gh copilot suggest "$(cat ${escapedPrompt})" > ${escapedOutput}`,
        output_file: task.output_file,
        group: "parallel",
      });
    }

    for (const group of sequentialGroups) {
      for (let i = 0; i < group.length; i++) {
        const task = group[i];
        const escapedPrompt = task.prompt_file.replace(/"/g, '\\"');
        const escapedOutput = task.output_file.replace(/"/g, '\\"');
        commands.push({
          command: `gh copilot suggest "$(cat ${escapedPrompt})" > ${escapedOutput}`,
          output_file: task.output_file,
          group: "sequential",
          order: i + 1,
        });
      }
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              total_tasks: tasks.length,
              parallel_tasks: parallelTasks.length,
              sequential_groups: sequentialGroups.length,
              conflicts_detected: sequentialGroups.length,
              commands,
              instructions:
                "Run parallel commands simultaneously. Run sequential commands in order (they target the same file).",
            },
            null,
            2
          ),
        },
      ],
    };
  }

  private async handlePreview(args: any) {
    const { prompt_file, target_file } = args;

    const absPrompt = path.isAbsolute(prompt_file)
      ? prompt_file
      : path.join(PROJECT_ROOT, prompt_file);
    const absTarget = path.isAbsolute(target_file)
      ? target_file
      : path.join(PROJECT_ROOT, target_file);

    let promptContent: string;
    try {
      promptContent = await fs.readFile(absPrompt, "utf-8");
    } catch {
      return {
        content: [
          { type: "text", text: `Prompt file not found: ${prompt_file}` },
        ],
        isError: true,
      };
    }

    let targetExists = false;
    let targetInfo = { lines: 0, size: 0 };
    try {
      const stat = await fs.stat(absTarget);
      const content = await fs.readFile(absTarget, "utf-8");
      targetExists = true;
      targetInfo = {
        lines: content.split("\n").length,
        size: stat.size,
      };
    } catch {
      // Target doesn't exist yet
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              prompt_file,
              target_file,
              target_exists: targetExists,
              target_info: targetExists ? targetInfo : "File will be created",
              prompt_preview: promptContent.slice(0, 500),
              prompt_lines: promptContent.split("\n").length,
              action: targetExists ? "MODIFY" : "CREATE",
              command: `gh copilot suggest "$(cat ${prompt_file})" > ${target_file}`,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  private getDefaultTemplate(intent: string): string {
    const templates: Record<string, string> = {
      implement_function: `# File: {filepath}

# Context
- Project: {project_name}
- Tech Stack: {tech_stack_summary}

# Function Signature
{function_signature}

# Requirements
{requirements_list}

# Edge Cases to Handle
{edge_cases_list}

# Related Patterns
{relevant_patterns}

# Success Criteria
- All type hints present
- Docstring with Args/Returns/Raises
- Edge cases handled
- No security violations`,

      fix_bug: `# File: {filepath}

# Bug Description
{description}

# Context
- Tech Stack: {tech_stack_summary}

# Requirements
- Fix the bug described above
- Add regression test if possible
- Do not introduce new bugs

# Related Lessons
{relevant_patterns}`,

      refactor: `# File: {filepath}

# Refactoring Goal
{description}

# Context
- Tech Stack: {tech_stack_summary}

# Requirements
- Maintain existing behavior
- Improve code quality and readability
- Keep all type hints
- Keep all tests passing`,

      write_tests: `# File: {filepath}

# What to Test
{description}

# Context
- Tech Stack: {tech_stack_summary}

# Requirements
- Cover happy path and edge cases
- Use appropriate testing framework
- Mock external dependencies
- Include assertion messages`,

      add_feature: `# File: {filepath}

# Feature Description
{description}

# Context
- Project: {project_name}
- Tech Stack: {tech_stack_summary}

# Function Signature (if applicable)
{function_signature}

# Edge Cases
{edge_cases_list}

# Success Criteria
- Feature works as described
- Type hints on all public APIs
- Docstrings present
- No security violations`,
    };

    return templates[intent] || templates.implement_function;
  }

  async run() {
    // Ensure directories exist
    await fs.mkdir(path.join(MEMORY_PATH, "prompts", "templates"), {
      recursive: true,
    });
    await fs.mkdir(path.join(MEMORY_PATH, "prompts", "generated"), {
      recursive: true,
    });
    await fs.mkdir(path.join(MEMORY_PATH, "snapshots"), { recursive: true });
    await fs.mkdir(SKILLS_PATH, { recursive: true });

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("[copilot-server] Running on stdio");
  }
}

const server = new CopilotServer();
server.run().catch(console.error);
