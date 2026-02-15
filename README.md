# Antigravity OS — MCP Server System

A TypeScript monorepo containing 3 MCP (Model Context Protocol) servers that power the Antigravity OS AI development workflow.

## Key Features

- **Abstract Response Pattern** — 80-90% token savings by returning structured references instead of raw content
- **Budget Enforcement** — hard daily/weekly/monthly cost limits prevent runaway spend
- **Git-Backed Persistence** — every `.memory/` change is committed; full history, diff, and rollback (time machine for memory)
- **Semantic Search** — local embeddings via `@xenova/transformers` find meaning, not just keywords
- **Concurrent Write Locking** — file-level locks ensure parallel tool calls never corrupt data
- **Loop Detection** — detects repeated identical operations and stops infinite retries

## Token Economics

The abstract response pattern dramatically reduces Claude API costs:

| Metric | Before (raw) | After (abstract) | Savings |
|--------|-------------|-------------------|---------|
| Monthly cost | ~$15 | ~$0.75 | **95%** |

Instead of returning full file contents, tools return compact references (`file`, `section`, `summary`, `relevance`) that Claude can resolve only when needed.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    Antigravity (Claude)                        │
│                    Primary orchestrator                        │
└───────┬────────────────┬────────────────┬────────────────────┘
        │ MCP stdio      │ MCP stdio      │ MCP stdio
        ▼                ▼                ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────────┐
│ memory-server│ │copilot-server│ │ analytics-server │
│  12 tools    │ │  7 tools     │ │   5 tools        │
│              │ │  1 prompt    │ │   1 prompt       │
└──────────────┘ └──────────────┘ └──────────────────┘
        │                │                │
        ▼                ▼                ▼
   .memory/         .memory/prompts/   .memory/snapshots/
   (markdown)       (templates)        (JSONL)
```

## Servers

### Memory Server (`@antigravity-os/memory-server`)
Manages the `.memory/` knowledge base with semantic search, git-backed persistence, and file locking.

**12 tools:** `memory_search`, `memory_read`, `memory_update`, `memory_log_decision`, `memory_log_lesson`, `memory_snapshot`, `get_context_summary`, `memory_history`, `memory_rollback`, `memory_diff`, `reindex_memory`, `show_locks`

### Copilot Server (`@antigravity-os/copilot-server`)
Orchestrates GitHub Copilot CLI — prompt generation, validation, scoring, and batch execution.

**7 tools:** `copilot_generate_prompt`, `copilot_execute`, `copilot_validate`, `copilot_score`, `copilot_batch_execute`, `copilot_preview`
**1 prompt:** `efficiency_rules`

### Analytics Server (`@antigravity-os/analytics-server`)
Cost tracking, performance analytics, and budget enforcement.

**5 tools:** `log_cost`, `get_cost_summary`, `get_copilot_performance`, `get_insights`, `check_budget`
**1 prompt:** `efficiency_rules`

## Quick Start

```bash
# Install
npm install

# Build all
npm run build

# Test a server
echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}' \
  | node packages/memory-server/build/index.js
```

## Claude Desktop Configuration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "antigravity-memory": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/packages/memory-server/build/index.js"],
      "env": {
        "PROJECT_ROOT": "/absolute/path/to/your/project"
      }
    },
    "antigravity-copilot": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/packages/copilot-server/build/index.js"],
      "env": {
        "PROJECT_ROOT": "/absolute/path/to/your/project"
      }
    },
    "antigravity-analytics": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/packages/analytics-server/build/index.js"],
      "env": {
        "PROJECT_ROOT": "/absolute/path/to/your/project"
      }
    }
  }
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PROJECT_ROOT` | `process.cwd()` | Absolute path to your project root |
| `MEMORY_DIR` | `.memory` | Memory directory name (relative to PROJECT_ROOT) |

## .memory/ Directory Structure

Created automatically on first run:

```
.memory/
├── core/               # Project fundamentals
│   ├── tech_stack.md
│   ├── project_overview.md
│   └── architecture.md
├── active/             # Current session state
│   ├── context.md
│   ├── task_queue.md
│   └── blockers.md
├── decisions/          # Architectural decisions
│   ├── ACTIVE.md
│   └── archive/
├── lessons/            # Learned patterns
│   ├── best_practices.md
│   ├── bugs_fixed.md
│   └── anti_patterns.md
├── prompts/
│   ├── templates/      # Copilot prompt templates
│   └── generated/      # Generated prompts
├── snapshots/          # Backups, costs, scores
│   ├── costs.jsonl
│   └── prompt_scores.jsonl
├── config/
│   └── budget.json     # Budget limits
└── semantic-index.json # Vector search index
```

## .skills/ Directory

The `.skills/` directory teaches Antigravity domain-specific capabilities. These are markdown files that get loaded as context to shape how the AI orchestrates tasks.

```
.skills/
├── copilot_mastery.md      # How to generate optimal Copilot prompts
├── code_review.md          # Review patterns and quality standards
└── domain_specific.md      # Your project's domain knowledge
```

Create these in your project root alongside `.memory/`. See [SETUP.md](SETUP.md) for details.

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `better-sqlite3` | SQLite database for analytics and cost tracking |
| `@xenova/transformers` | Local embedding model for semantic search (no API calls) |
| `sqlite-vss` | Vector similarity search extension for SQLite |
| `@modelcontextprotocol/sdk` | MCP protocol implementation |
| `simple-git` | Git operations for memory persistence |

## Development

```bash
# Watch mode for a specific package
npm run dev -w @antigravity-os/memory-server

# Clean build artifacts
npm run clean

# Rebuild everything
npm run clean && npm run build
```

## Security

⚠️ **Important**: Before using this in production or committing to public repositories:

- Review [SECURITY.md](SECURITY.md) for security considerations and best practices
- Ensure `.memory/` and `.skills/` directories are in your `.gitignore`
- Never commit API keys, credentials, or sensitive data
- Regularly audit what's stored in `.memory/` before committing
- Run with minimal necessary file system permissions

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
