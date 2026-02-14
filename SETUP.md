# Setup Guide — Antigravity OS MCP Servers (macOS)

## Prerequisites

- **Node.js** >= 18 (`node -v`)
- **npm** >= 9 (`npm -v`)
- **Git** (`git --version`)
- **GitHub CLI** with Copilot extension (for copilot-server):
  ```bash
  brew install gh
  gh auth login
  gh extension install github/gh-copilot
  ```

## Installation

```bash
cd /path/to/mcp-server

# Install all dependencies
npm install

# Build all 3 servers
npm run build
```

## Configure Claude Desktop

1. Open Claude Desktop settings (Cmd+,) or edit the config file directly:

```bash
code ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

2. Add the 3 servers (replace paths with your actual absolute paths):

```json
{
  "mcpServers": {
    "antigravity-memory": {
      "command": "node",
      "args": ["/Users/YOU/path/to/mcp-server/packages/memory-server/build/index.js"],
      "env": {
        "PROJECT_ROOT": "/Users/YOU/path/to/your-project"
      }
    },
    "antigravity-copilot": {
      "command": "node",
      "args": ["/Users/YOU/path/to/mcp-server/packages/copilot-server/build/index.js"],
      "env": {
        "PROJECT_ROOT": "/Users/YOU/path/to/your-project"
      }
    },
    "antigravity-analytics": {
      "command": "node",
      "args": ["/Users/YOU/path/to/mcp-server/packages/analytics-server/build/index.js"],
      "env": {
        "PROJECT_ROOT": "/Users/YOU/path/to/your-project"
      }
    }
  }
}
```

3. Restart Claude Desktop.

## Verify

After restart, Claude Desktop should show the MCP tools in the tool list. You can verify by asking Claude:

> "List all available MCP tools"

You should see 24 tools across 3 servers.

## Semantic Search (Optional)

The memory server can use `@xenova/transformers` for semantic embedding search. The model (~30MB) downloads on first use when you call `reindex_memory`.

If the model fails to load (network issues, etc.), the system automatically falls back to keyword search. No action needed.

## Budget Configuration

Edit `.memory/config/budget.json` in your project root:

```json
{
  "daily_limit_usd": 2.0,
  "weekly_limit_usd": 10.0,
  "monthly_limit_usd": 30.0,
  "alert_threshold": 0.8,
  "costs": {
    "antigravity_input": 0.015,
    "antigravity_output": 0.075,
    "copilot": 0.0
  },
  "emergency_override": false
}
```

A default config is created automatically on first run.

## Copilot Prompt Templates

Create templates in `.memory/prompts/templates/` for each intent:

```bash
mkdir -p .memory/prompts/templates
```

Example template (`.memory/prompts/templates/implement.md`):

```markdown
# Implementation Task
## Context
{{context}}
## Requirements
{{requirements}}
## Constraints
- Follow existing code style
- Include type annotations
- Add error handling for edge cases
```

The `copilot_generate_prompt` tool substitutes `{{variable}}` placeholders with provided values.

## Troubleshooting

**Server fails to start:**
- Check `node --version` (needs >= 18)
- Verify paths in claude_desktop_config.json are absolute
- Check stderr: `node packages/memory-server/build/index.js 2>&1`

**Git persistence errors:**
- Ensure `git` is installed and available in PATH
- The memory server auto-initializes a git repo in `.memory/`

**Copilot CLI not found:**
- Install: `gh extension install github/gh-copilot`
- Auth: `gh auth login`
- Test: `gh copilot suggest "hello world in python"`

## Initial Memory Bootstrap

After setup, bootstrap your `.memory/` with knowledge from your existing Antigravity chat. Paste this into Antigravity IDE:

```
Read our entire conversation history and create:
1. .memory/core/tech_stack.md with our tech stack
2. .memory/decisions/ACTIVE.md with key decisions we've made
3. .memory/lessons/best_practices.md with patterns we've learned
4. .memory/core/project_overview.md with what we're building
```

This seeds the memory system so new sessions start with full context instead of a blank slate.

## Skills Creation

Create the `.skills/` directory in your project root to teach Antigravity domain-specific behavior:

```bash
mkdir -p .skills
```

Create at minimum `copilot_mastery.md` — this teaches Antigravity how to generate prompts that Copilot CLI actually executes well:

```bash
# In Antigravity IDE, ask:
"Based on everything we've learned about using Copilot CLI,
create .skills/copilot_mastery.md with:
- Prompt patterns that work well
- Common pitfalls to avoid
- Token-efficient prompt structures"
```

Other useful skills files:
- `.skills/code_review.md` — your review standards and patterns
- `.skills/domain_specific.md` — domain knowledge specific to your project

## First-Time Semantic Indexing

After creating memory files, build the vector index so `memory_search` can find content by meaning:

```
# In Claude Desktop, ask:
"Call reindex_memory to build the semantic search index"
```

The embedding model (~30MB) downloads on the first call. Subsequent reindexes are fast. Re-run this after adding significant new content to `.memory/`.

## Testing the Workflow

Verify the full Manager → Worker → Verify cycle with a test task:

```
1. Ask Antigravity: "I need to implement user authentication"
2. It calls memory_search to find relevant context
3. It calls copilot_generate_prompt to create an optimized prompt
4. You run: gh copilot suggest "$(cat .memory/prompts/generated/task_*.md)"
5. Antigravity calls copilot_validate to check the output
6. If approved, it calls memory_log_lesson to record what worked
7. analytics log_cost tracks the token spend
```

If any step fails, check the Troubleshooting section above.

## Budget Override

When you hit a budget limit mid-task, the `check_budget` tool will block further operations. To temporarily override:

Edit `.memory/config/budget.json`:

```json
{
  "emergency_override": true
}
```

Set it back to `false` when done. You can also adjust the limits themselves:

```json
{
  "daily_limit_usd": 2.0,
  "weekly_limit_usd": 10.0,
  "monthly_limit_usd": 30.0,
  "alert_threshold": 0.8,
  "emergency_override": false
}
```

## Git Recovery (Time Machine)

Every `.memory/` change is git-committed automatically. Use these tools to browse and restore history:

```
# View last 10 versions of a file
memory_history("decisions_active", 10)

# Compare two versions
memory_diff("lessons/best_practices.md", "abc123", "def456")

# Rollback a file to a previous commit
memory_rollback("lessons/bugs_fixed.md", "abc123")
```

You can also use git directly in the `.memory/` directory:

```bash
cd .memory
git log --oneline                              # browse history
git diff HEAD~3 -- lessons/best_practices.md   # compare versions
git checkout abc123 -- lessons/bugs_fixed.md    # restore a file
```
