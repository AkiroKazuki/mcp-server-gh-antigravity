# Antigravity OS — MCP Server System

[![CI](https://github.com/AkiroKazuki/mcp-server-gh-antigravity/actions/workflows/ci.yml/badge.svg)](https://github.com/AkiroKazuki/mcp-server-gh-antigravity/actions/workflows/ci.yml)
[![Security Audit](https://github.com/AkiroKazuki/mcp-server-gh-antigravity/actions/workflows/security.yml/badge.svg)](https://github.com/AkiroKazuki/mcp-server-gh-antigravity/actions/workflows/security.yml)
[![CodeQL](https://github.com/AkiroKazuki/mcp-server-gh-antigravity/actions/workflows/codeql.yml/badge.svg)](https://github.com/AkiroKazuki/mcp-server-gh-antigravity/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

A TypeScript monorepo containing 3 MCP ([Model Context Protocol](https://modelcontextprotocol.io)) servers that power the Antigravity OS AI development workflow. **54 tools + 4 prompts** across memory management, copilot orchestration, and analytics.

## Highlights

| Feature | Description |
|---------|-------------|
| **54 tools + 4 prompts** | Memory (25), Copilot (14 + 2 prompts), Analytics (15 + 2 prompts) |
| **Temporal memory** | Confidence scoring with automatic decay, validation, and contradiction detection |
| **Semantic search** | Local embeddings via `@xenova/transformers` — no external API calls |
| **Git-backed persistence** | Every `.memory/` change is committed; full history, diff, and rollback |
| **Budget enforcement** | Hard daily/weekly/monthly cost limits with emergency overrides |
| **AST context minification** | Extracts only exported API surface from dependencies to save tokens |
| **Auto-healing code gen** | Retry loop feeds validation errors back as correction prompts |
| **Dependency graphing** | Map upstream/downstream import relationships |
| **Response caching** | SQLite-backed cache avoids regenerating validated results |
| **Concurrent write safety** | File-level locks + SQLite WAL mode across all 3 servers |

## Key Features

- **Abstract Response Pattern** — 80–90% token savings by returning structured references instead of raw content
- **Budget Enforcement** — hard daily/weekly/monthly cost limits prevent runaway spend
- **Git-Backed Persistence** — every `.memory/` change is committed; full history, diff, and rollback
- **Temporal Memory** — confidence scoring with automatic decay; validate, prune, and detect contradictions
- **Semantic Search** — local embeddings via `@xenova/transformers` find meaning, not just keywords
- **Response Caching** — SQLite-backed cache avoids regenerating validated results
- **Concurrent Write Locking** — file-level locks ensure parallel tool calls never corrupt data
- **Loop Detection** — detects repeated identical operations and stops infinite retries
- **Rate Limiting** — sliding window rate limits per operation

## Token Economics

The abstract response pattern dramatically reduces Claude API costs:

| Metric | Before (raw) | After (abstract) | Savings |
|--------|-------------|-------------------|---------|
| Monthly cost | ~$15 | ~$0.75 | **95%** |

Instead of returning full file contents, tools return compact references (`file`, `section`, `summary`, `relevance`) that Claude can resolve only when needed.

## Architecture

```
+------------------------------------------------------------------+
|                    MCP Client (e.g. Claude Desktop)               |
+--------+-------------------+-------------------+-----------------+
         | MCP stdio         | MCP stdio         | MCP stdio
         v                   v                   v
+------------------+ +------------------+ +--------------------+
| memory-server    | | copilot-server   | | analytics-server   |
|  25 tools        | |  14 tools        | |  15 tools          |
|                  | |   2 prompts      | |   2 prompts        |
+------------------+ +------------------+ +--------------------+
         |                   |                   |
         +-------------------+-------------------+
                             |
                     .memory/antigravity.db
                     (shared SQLite, WAL mode)
```

All three servers are independent Node.js processes communicating via MCP stdio transport. They share a single SQLite database coordinated by WAL mode and a reference-counted connection manager.

## Servers

### Memory Server (`@antigravity-os/memory-server`)

Manages the `.memory/` knowledge base with semantic search, git-backed persistence, temporal confidence, and file locking.

**25 tools:**

| Tool | Description |
|------|-------------|
| `memory_search` | Search with confidence ranking; semantic or keyword fallback |
| `memory_read` | Read a memory file with confidence metadata |
| `memory_update` | Update a file (append/replace/update_section); git auto-commit |
| `memory_log_decision` | Log a structured architectural decision |
| `memory_log_lesson` | Log a bug fix, pattern, or anti-pattern |
| `memory_snapshot` | Create a backup snapshot with confidence data |
| `get_context_summary` | Compressed project state with confidence filtering |
| `memory_history` | Git history of a memory file |
| `memory_rollback` | Rollback a file to a previous commit |
| `memory_diff` | Show changes including confidence deltas |
| `reindex_memory` | Rebuild semantic index and sync temporal metadata |
| `show_locks` | Show active file locks (debugging) |
| `validate_memory` | Validate an entry to boost its confidence score |
| `memory_health_report` | Confidence distribution, alerts, health score |
| `detect_contradictions` | Find contradictory entries via semantic similarity |
| `suggest_pruning` | Dry-run recommendations for archiving low-confidence entries |
| `apply_pruning` | Archive entries from suggest_pruning |
| `memory_undo` | Undo recent operations via git rollback (max 10 steps) |
| `import_research_analysis` | Import research analysis into memory with confidence scoring |
| `get_research_context` | Retrieve research context for decision-making |
| `resolve_contradiction` | Atomically resolve a contradiction: archive one entry, validate the other |
| `memory_ingest_url` | Fetch a URL, convert HTML to markdown, store as research entry |
| `memory_stage` | Stage a memory change without committing to git |
| `memory_commit_staged` | Commit all staged changes as a single atomic git commit |
| `memory_auto_validate` | Auto-validate entries: boost high-quality, decay stale/contradicted |

### Copilot Server (`@antigravity-os/copilot-server`)

Orchestrates GitHub Copilot CLI -- prompt generation, validation, scoring, caching, and failure analysis.

**14 tools + 2 prompts:**

| Tool | Description |
|------|-------------|
| `copilot_generate_prompt` | Build a prompt from a skill template with multi-file context |
| `copilot_execute` | Save generated code with caching and loop detection |
| `copilot_validate` | Validate code for security, quality, and trading patterns |
| `copilot_score` | Score output for relevance, correctness, quality, security |
| `copilot_batch_execute` | Execute multiple prompts with conflict detection |
| `copilot_preview` | Preview prompt output without saving |
| `copilot_get_context` | Gather multi-file context (imports, types, git diffs) |
| `copilot_cache_clear` | Clear the response cache (all/expired/today) |
| `copilot_cache_stats` | Cache hit/miss statistics |
| `analyze_failure` | Diagnose why a prompt failed |
| `suggest_skill_update` | Propose skill file changes based on failure analysis |
| `copilot_execute_and_validate` | Execute and validate in a single operation |
| `implement_with_research_context` | Implement code changes with research context integration |
| `copilot_dependency_graph` | Map import dependency graph (upstream/downstream) from entry file |

| Prompt | Description |
|--------|-------------|
| `efficiency_rules` | Core efficiency rules for reducing token waste |
| `quality_standards` | Code quality and validation requirements |

### Analytics Server (`@antigravity-os/analytics-server`)

Cost tracking, performance profiling, budget enforcement, rate limiting, and system health monitoring.

**15 tools + 2 prompts:**

| Tool | Description |
|------|-------------|
| `log_cost` | Log an API cost event with operation timing |
| `get_cost_summary` | Cost summary for a period with predictions |
| `get_copilot_performance` | Copilot stats with skill correlation |
| `get_insights` | Actionable optimization suggestions |
| `check_budget` | Budget check with rate limiting |
| `get_performance_profile` | Operation timing with p50/p95/p99 percentiles |
| `system_health` | Check system components (disk, git, index, budget, DB) |
| `get_skill_effectiveness` | Analyze which skill files produce the best results |
| `predict_monthly_cost` | Predict monthly cost with trend analysis |
| `get_bottlenecks` | Identify slow operations above threshold |
| `export_analytics` | Export analytics data as JSON |
| `set_rate_limit` | Configure sliding window rate limits |
| `get_rate_limit_status` | Current rate limit config and usage |
| `log_research_outcome` | Log research outcomes and their effectiveness |
| `set_budget_override` | Emergency budget override with multiplier and expiry |

| Prompt | Description |
|--------|-------------|
| `efficiency_rules` | Core efficiency rules for reducing token waste |
| `cost_awareness` | Budget awareness and cost optimization guidelines |

## Quick Start

```bash
# Install
npm install

# Build all
npm run build

# Run tests
npm test

# Test a server manually
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

See [`examples/claude_desktop_config.json`](examples/claude_desktop_config.json) for a complete example.

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
├── snapshots/          # Backups and exports
├── config/
│   └── budget.json     # Budget limits
└── antigravity.db      # SQLite (metadata, cache, costs, scores, embeddings)
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
| `better-sqlite3` | SQLite database with WAL mode for metadata, cache, embeddings, and analytics |
| `@xenova/transformers` | Local embedding model for semantic search (no API calls) |
| `@modelcontextprotocol/sdk` | MCP protocol implementation |
| `ts-morph` | TypeScript AST parsing for context minification |
| `zod` | Schema validation for all tool inputs |

## Development

```bash
# Install dependencies
npm install

# Build all packages (shared builds first)
npm run build

# Run unit tests (Vitest)
npm test

# Run smoke tests (verifies all servers start and expose correct tool counts)
node test-all.mjs

# Watch mode
npm run test:watch

# Clean build artifacts
npm run clean
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow, coding standards, and PR guidelines.

## License

[MIT](LICENSE) © AkiroKazuki
