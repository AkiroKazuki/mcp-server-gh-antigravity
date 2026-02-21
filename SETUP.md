# Setup Guide — Antigravity OS v2.1 MCP Servers (macOS)

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

# Run tests
npm test
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

See [`examples/claude_desktop_config.json`](examples/claude_desktop_config.json) for a complete example.

3. Restart Claude Desktop.

## Verify

After restart, Claude Desktop should show the MCP tools in the tool list. You can verify by asking Claude:

> "List all available MCP tools"

You should see **47 tools** and **4 prompts** across 3 servers:
- Memory server: 20 tools
- Copilot server: 13 tools + 2 prompts
- Analytics server: 14 tools + 2 prompts

## Temporal Memory (v2)

v2 introduces temporal memory with confidence scoring. Every memory entry now tracks:

| Field | Description |
|-------|-------------|
| `confidence` | 0.0-1.0 score; starts at 0.5 for new entries |
| `created_at` | When the entry was first created |
| `last_validated` | Last time someone confirmed the entry is still accurate |
| `decay_rate` | Confidence drops over time if not validated |

**How confidence works:**
- New entries start at **0.5** confidence
- `validate_memory` boosts confidence toward 1.0
- Entries decay automatically over time if not re-validated
- `memory_search` can filter by `min_confidence`
- `get_context_summary` can filter by `min_confidence`
- `reindex_memory` applies decay and syncs temporal metadata

**Confidence levels:**

| Range | Status | Meaning |
|-------|--------|---------|
| 0.7 - 1.0 | High | Recently validated, trustworthy |
| 0.4 - 0.7 | Medium | May need re-validation |
| 0.0 - 0.4 | Low | Stale; candidate for pruning |

## Contradiction Detection

Find conflicting memory entries:

```
1. Call detect_contradictions to scan for semantic conflicts
2. Review pairs with high similarity but opposing keywords
3. Use validate_memory to boost the correct entry
4. Use apply_pruning to archive the incorrect entry
```

The tool uses semantic pairwise comparison and conflict keyword detection (e.g., "use" vs "avoid", "always" vs "never").

## Memory Health and Pruning

Monitor and clean up memory:

```
1. Call memory_health_report for confidence distribution and alerts
2. Call suggest_pruning to get dry-run archive recommendations
3. Review candidates (low-confidence + old entries)
4. Call apply_pruning with confirmed entry_ids to archive them
```

## Memory Undo

Undo recent memory operations using git rollback:

```
# Undo the last operation
memory_undo()

# Undo the last 3 operations
memory_undo(steps=3)
```

Maximum 10 steps. Each undo is itself committed to git, so the undo is also reversible.

## Response Caching (v2)

The copilot server caches responses in SQLite to avoid regenerating validated results:

- **Automatic**: `copilot_execute` caches by default (`use_cache: true`)
- **Stats**: `copilot_cache_stats` shows hit rate and entry count
- **Clear**: `copilot_cache_clear` with scope `all`, `expired`, or `today`
- Cache is stored in `.memory/antigravity.db`

## Rate Limiting (v2)

Configure sliding window rate limits per operation:

```
# Set a rate limit
set_rate_limit(operation="copilot_execute", per_minute=10, per_hour=100)

# Check current limits
get_rate_limit_status()

# check_budget respects rate limits when operation is specified
check_budget(estimated_tokens=1000, agent="antigravity", operation="copilot_execute")
```

Windows: per minute, per hour, per day. See [`examples/budget.json`](examples/budget.json) for example configuration.

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

The `copilot_generate_prompt` tool substitutes `{{variable}}` placeholders with provided values and injects multi-file context automatically.

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

**SQLite errors:**
- Ensure `better-sqlite3` installed correctly: `npm rebuild better-sqlite3`
- The `.memory/antigravity.db` file is created automatically on first run

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

Create at minimum `copilot_mastery.md` -- this teaches Antigravity how to generate prompts that Copilot CLI actually executes well:

```bash
# In Antigravity IDE, ask:
"Based on everything we've learned about using Copilot CLI,
create .skills/copilot_mastery.md with:
- Prompt patterns that work well
- Common pitfalls to avoid
- Token-efficient prompt structures"
```

Other useful skills files:
- `.skills/code_review.md` -- your review standards and patterns
- `.skills/domain_specific.md` -- domain knowledge specific to your project

## First-Time Semantic Indexing

After creating memory files, build the vector index so `memory_search` can find content by meaning:

```
# In Claude Desktop, ask:
"Call reindex_memory to build the semantic search index"
```

The embedding model (~30MB) downloads on the first call. Subsequent reindexes are fast. Re-run this after adding significant new content to `.memory/`.

## Testing the v2 Workflow

Verify the full workflow with a test task:

```
1. Ask Antigravity: "I need to implement user authentication"
2. It calls memory_search to find relevant context (with confidence filtering)
3. It calls copilot_get_context to gather imports, types, and git diffs
4. It calls copilot_generate_prompt with multi-file context injection
5. You run: gh copilot suggest "$(cat .memory/prompts/generated/task_*.md)"
6. Antigravity calls copilot_validate to check the output
7. If the output fails, call analyze_failure to diagnose why
8. If approved, call memory_log_lesson to record what worked
9. Call copilot_score to track quality trends
10. analytics log_cost tracks the token spend
11. Call validate_memory on relevant entries to boost confidence
12. Periodically: detect_contradictions, memory_health_report, system_health
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

# Undo the last N operations (v2)
memory_undo(steps=3)
```

You can also use git directly in the `.memory/` directory:

```bash
cd .memory
git log --oneline                              # browse history
git diff HEAD~3 -- lessons/best_practices.md   # compare versions
git checkout abc123 -- lessons/bugs_fixed.md    # restore a file
```
