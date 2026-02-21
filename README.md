# Antigravity OS v2.0 — MCP Server System

[![CI](https://github.com/AkiroKazuki/mcp-server-gh-antigravity/actions/workflows/ci.yml/badge.svg)](https://github.com/AkiroKazuki/mcp-server-gh-antigravity/actions/workflows/ci.yml)
[![Security Audit](https://github.com/AkiroKazuki/mcp-server-gh-antigravity/actions/workflows/security.yml/badge.svg)](https://github.com/AkiroKazuki/mcp-server-gh-antigravity/actions/workflows/security.yml)
[![CodeQL](https://github.com/AkiroKazuki/mcp-server-gh-antigravity/actions/workflows/codeql.yml/badge.svg)](https://github.com/AkiroKazuki/mcp-server-gh-antigravity/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A TypeScript monorepo containing 3 MCP (Model Context Protocol) servers that power the Antigravity OS AI development workflow. **42 tools + 4 prompts** across memory management, copilot orchestration, and analytics.

## What's New in v2

| Area | v1 | v2 |
|------|----|----|
| Total tools | 24 | **42** |
| Prompts | 2 | **4** |
| Memory entries | Static markdown | **Temporal with confidence scoring and decay** |
| Contradiction detection | -- | **Semantic pairwise comparison** |
| Memory health | -- | **Health reports, pruning, undo** |
| Response caching | -- | **SQLite-backed cache with hit/miss stats** |
| Failure analysis | -- | **Root cause diagnosis + skill update suggestions** |
| Context gathering | Single file | **Multi-file (imports, types, git diffs)** |
| Performance profiling | -- | **p50/p95/p99 percentiles** |
| System health | -- | **Disk, git, index, budget, DB checks** |
| Rate limiting | -- | **Sliding window (per minute/hour/day)** |
| Cost prediction | -- | **Trend analysis with confidence ranges** |
| Undo | Git rollback per file | **Operation-level undo via git** |

## Key Features

- **Abstract Response Pattern** -- 80-90% token savings by returning structured references instead of raw content
- **Budget Enforcement** -- hard daily/weekly/monthly cost limits prevent runaway spend
- **Git-Backed Persistence** -- every `.memory/` change is committed; full history, diff, and rollback
- **Temporal Memory** -- confidence scoring with automatic decay; validate, prune, and detect contradictions
- **Semantic Search** -- local embeddings via `@xenova/transformers` find meaning, not just keywords
- **Response Caching** -- SQLite-backed cache avoids regenerating validated results
- **Concurrent Write Locking** -- file-level locks ensure parallel tool calls never corrupt data
- **Loop Detection** -- detects repeated identical operations and stops infinite retries
- **Rate Limiting** -- sliding window rate limits per operation

## Token Economics

The abstract response pattern dramatically reduces Claude API costs:

| Metric | Before (raw) | After (abstract) | Savings |
|--------|-------------|-------------------|---------|
| Monthly cost | ~$15 | ~$0.75 | **95%** |

Instead of returning full file contents, tools return compact references (`file`, `section`, `summary`, `relevance`) that Claude can resolve only when needed.

## Architecture

```
+-----------------------------------------------------------------+
|                    Antigravity (Claude)                          |
|                    Primary orchestrator                         |
+--------+------------------+------------------+------------------+
         | MCP stdio        | MCP stdio        | MCP stdio
         v                  v                  v
+----------------+ +------------------+ +--------------------+
| memory-server  | | copilot-server   | | analytics-server   |
|  18 tools      | |  11 tools        | |  13 tools          |
|                | |   2 prompts      | |   2 prompts        |
+----------------+ +------------------+ +--------------------+
         |                  |                  |
         v                  v                  v
    .memory/          .memory/prompts/    .memory/snapshots/
    antigravity.db    (templates)         (JSONL + exports)
    (markdown+SQLite) (generated)
```

## Servers

### Memory Server (`@antigravity-os/memory-server`)

Manages the `.memory/` knowledge base with semantic search, git-backed persistence, temporal confidence, and file locking.

**18 tools:**

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

### Copilot Server (`@antigravity-os/copilot-server`)

Orchestrates GitHub Copilot CLI -- prompt generation, validation, scoring, caching, and failure analysis.

**11 tools + 2 prompts:**

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

| Prompt | Description |
|--------|-------------|
| `efficiency_rules` | Core efficiency rules for reducing token waste |
| `quality_standards` | Code quality and validation requirements |

### Analytics Server (`@antigravity-os/analytics-server`)

Cost tracking, performance profiling, budget enforcement, rate limiting, and system health monitoring.

**13 tools + 2 prompts:**

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
├── snapshots/          # Backups, costs, scores, exports
│   ├── costs.jsonl
│   └── scores.jsonl
├── config/
│   └── budget.json     # Budget limits
├── antigravity.db      # SQLite (metadata, cache, performance logs)
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
| `better-sqlite3` | SQLite database for metadata, cache, performance logs, and temporal memory |
| `@xenova/transformers` | Local embedding model for semantic search (no API calls) |
| `@modelcontextprotocol/sdk` | MCP protocol implementation (^1.12.1) |

## Development

```bash
# Watch mode for a specific package
npm run dev -w @antigravity-os/memory-server

# Clean build artifacts
npm run clean

# Rebuild everything
npm run clean && npm run build

# Run all tests
npm test
```
