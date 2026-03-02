# Changelog

## v2.2.1

Stability and security patch. Fixes all critical audit findings and resolves npm vulnerability alerts.

### Bug Fixes

- **Dependency graph**: Fixed infinite recursion on circular imports (added visited set)
- **AST extractor**: Fixed memory leak — source files are now removed after extraction
- **Semantic reindex**: Atomic transaction prevents data loss if indexing fails midway
- **Staging area**: `finally` block ensures staging is cleared even on partial failure
- **CLI executor**: Temp file cleanup moved to `finally` block (no more leaked files)
- **Research metadata**: File locking prevents race conditions on concurrent writes
- **Database manager**: Guard against negative ref counts; WAL pragma failure no longer leaks connections
- **Lock manager**: Resolve lock promise on release (fixes potential deadlocks)
- **Temporal memory**: Safe JSON.parse in `rowToEntry` with fallback to `[]` on corrupt data
- **Health monitor**: Bounds check on `df` output parsing prevents NaN
- **Budget enforcer**: Cost log queries now filter in SQL instead of loading all rows
- **Error handling**: Replaced `catch (error: any)` with `catch (error: unknown)` across all servers

### Security

- Upgraded `glob` 10.5 → 13.0.6 (resolves minimatch ReDoS CVEs)
- Upgraded `hono` and `minimatch` to patched versions
- `npm audit` reports 0 vulnerabilities

### Housekeeping

- Removed unused imports (`parseJsonl`, `Database` type)
- Added `FileLockManager` to analytics server context
- Added try-catch around analytics export queries

## v2.2.0

Stability, autonomy & architecture upgrade: **54 tools + 4 prompts**. Fixes critical concurrency issues, extracts handler architecture, adds autonomous code remediation, external knowledge ingestion, and infrastructure hardening.

### Architecture & Stability

- **SQLite busy timeout**: All `new Database()` calls now use `{ timeout: 5000 }` to prevent SQLITE_BUSY crashes under concurrent load
- **Cross-process data safety**: Migrated `.jsonl` file writes (costs, scores, research outcomes) to SQLite tables with WAL mode
- **Handler extraction**: Extracted all tool handlers from monolithic server classes into `handlers/` directories with typed context interfaces
- **Unit testing**: Added Vitest framework with 25 tests covering temporal decay, budget enforcer, lock manager, and error handling
- **Zod schema validation**: All 54 tools use Zod schemas for input validation with typed args (replaces `args: any`)
- **Centralized error handling**: `withToolHandler` wrapper in shared package for consistent error formatting
- **Semantic index migration**: Moved semantic index from flat JSON file to SQLite `semantic_chunks` table with BLOB embeddings for incremental updates
- **Database connection pooling**: Shared `DatabaseManager` in `@antigravity-os/shared` for reference-counted connection reuse across servers
- **Operation-specific idempotency TTLs**: Decisions and lessons use 24h TTL; default operations use 1h TTL

### Memory Server (20 -> 25 tools)

**New tools:**
- `resolve_contradiction` -- atomically resolve a contradiction: archive one entry, validate the other, log rationale
- `memory_ingest_url` -- fetch a URL, convert HTML to markdown, store as structured research entry in temporal memory
- `memory_stage` -- stage a memory change without committing to git for atomic multi-file updates
- `memory_commit_staged` -- commit all staged changes as a single atomic git commit
- `memory_auto_validate` -- auto-validate entries by boosting high-quality and decaying stale/contradicted entries

**Enhancements:**
- `detect_contradictions` -- cluster-first approach using semantic similarity (near O(n) vs O(n²) pairwise)

### Copilot Server (13 -> 14 tools)

**New tools:**
- `copilot_dependency_graph` -- map import dependency graph (upstream/downstream) from an entry file

**Enhancements:**
- `copilot_execute_and_validate` -- added auto-heal retry loop (up to 5 retries) that feeds validation errors back as correction prompts
- `copilot_get_context` -- AST-based context minification via ts-morph extracts only exported API surface from dependencies

### Analytics Server (14 -> 15 tools)

**New tools:**
- `set_budget_override` -- emergency budget override with multiplier, reason, and expiry; integrates with `check_budget`

## v2.1.0

Research integration upgrade: **47 tools + 4 prompts**. Adds research context integration tools for enhanced decision-making and cross-server research workflow support.

### Memory Server (18 -> 20 tools)

**New tools:**
- `import_research_analysis` -- import research analysis into memory with confidence scoring
- `get_research_context` -- retrieve research context for decision-making

### Copilot Server (11 -> 13 tools)

**New tools:**
- `copilot_execute_and_validate` -- execute and validate in a single operation for streamlined workflow
- `implement_with_research_context` -- implement code changes with research context integration

### Analytics Server (13 -> 14 tools)

**New tools:**
- `log_research_outcome` -- log research outcomes and their effectiveness for analytics tracking

---

## v2.0.0

Major upgrade: 24 tools -> **42 tools + 4 prompts**. Adds temporal memory, response caching, failure analysis, performance profiling, rate limiting, and system health monitoring.

### Memory Server (12 -> 18 tools)

**Enhanced:**
- `memory_search` -- added `min_confidence` filter and `include_metadata` option
- `memory_read` -- returns confidence data for matching entries
- `memory_update` -- logs temporal metadata and commit hashes
- `memory_log_decision` -- creates temporal entries with confidence tracking
- `memory_log_lesson` -- creates temporal entries with validation tracking
- `memory_snapshot` -- includes confidence data in snapshots
- `get_context_summary` -- supports `min_confidence` filtering
- `memory_history` -- includes confidence evolution context
- `memory_rollback` -- preserves and logs temporal metadata
- `memory_diff` -- surfaces confidence changes
- `reindex_memory` -- syncs temporal metadata from markdown, applies confidence decay
- `show_locks` -- unchanged

**New tools:**
- `validate_memory` -- validate an entry to boost its confidence score
- `memory_health_report` -- confidence distribution, alerts, and health score
- `detect_contradictions` -- find contradictory entries using semantic pairwise comparison
- `suggest_pruning` -- dry-run recommendations for archiving low-confidence entries
- `apply_pruning` -- archive entries confirmed from suggest_pruning
- `memory_undo` -- undo recent operations via git rollback (max 10 steps)

**New modules:**
- `temporal.ts` -- temporal memory with confidence scoring, decay, validation, and pruning
- `database.ts` -- SQLite database management for metadata and operations log

### Copilot Server (7 tools + 1 prompt -> 11 tools + 2 prompts)

**Enhanced:**
- `copilot_generate_prompt` -- multi-file context injection (imports, types, git diffs)
- `copilot_execute` -- SQLite-backed response caching, loop detection by task ID
- `copilot_validate` -- enhanced security and trading pattern checks
- `copilot_score` -- skill effectiveness tracking (scores logged per skill file)
- `copilot_batch_execute` -- conflict detection for duplicate output files
- `copilot_preview` -- enhanced diff support

**New tools:**
- `copilot_get_context` -- gather multi-file context (imports, types, signatures, git changes)
- `copilot_cache_clear` -- clear response cache (all/expired/today)
- `copilot_cache_stats` -- cache hit/miss statistics
- `analyze_failure` -- diagnose why a prompt failed (read-only)
- `suggest_skill_update` -- propose skill file changes based on failure analysis

**New prompts:**
- `quality_standards` -- code quality and validation requirements

**New modules:**
- `cache-manager.ts` -- SQLite-backed response cache with hit tracking
- `context-gatherer.ts` -- multi-file context resolution (imports, types, git diffs)
- `failure-analyzer.ts` -- failure categorization and skill update suggestions

### Analytics Server (5 tools + 1 prompt -> 13 tools + 2 prompts)

**Enhanced:**
- `log_cost` -- accepts `duration_ms` for operation timing
- `get_cost_summary` -- enhanced with prediction data
- `get_copilot_performance` -- skill correlation analysis
- `get_insights` -- expanded to cover performance and quality insights
- `check_budget` -- integrated rate limiting (sliding window)

**New tools:**
- `get_performance_profile` -- operation timing with p50/p95/p99 percentiles
- `system_health` -- check system components (disk, git, index, budget, database)
- `get_skill_effectiveness` -- analyze which skills produce the best results
- `predict_monthly_cost` -- monthly cost prediction with trend analysis and confidence ranges
- `get_bottlenecks` -- identify slow operations exceeding a duration threshold
- `export_analytics` -- export analytics data as JSON (costs, performance, scores, health)
- `set_rate_limit` -- configure sliding window rate limits (per minute/hour/day)
- `get_rate_limit_status` -- current rate limit configuration and usage

**New prompts:**
- `cost_awareness` -- budget awareness and cost optimization guidelines

**New modules:**
- `performance.ts` -- performance profiler with percentile calculation
- `health-monitor.ts` -- system health checks (disk, git, index, budget, DB)

### Infrastructure

- **SQLite database** -- `.memory/antigravity.db` for metadata, cache, performance logs, and temporal memory
- **MCP SDK** -- upgraded to `@modelcontextprotocol/sdk` ^1.12.1
- **Git persistence** -- uses `child_process` exec directly (removed `simple-git` dependency)
- **npm workspaces** -- TypeScript monorepo with 3 packages

---

## v1.0.0

Initial release. 24 tools + 2 prompts across 3 MCP servers.

- **Memory Server** (12 tools): `memory_search`, `memory_read`, `memory_update`, `memory_log_decision`, `memory_log_lesson`, `memory_snapshot`, `get_context_summary`, `memory_history`, `memory_rollback`, `memory_diff`, `reindex_memory`, `show_locks`
- **Copilot Server** (7 tools + 1 prompt): `copilot_generate_prompt`, `copilot_execute`, `copilot_validate`, `copilot_score`, `copilot_batch_execute`, `copilot_preview` + `efficiency_rules` prompt
- **Analytics Server** (5 tools + 1 prompt): `log_cost`, `get_cost_summary`, `get_copilot_performance`, `get_insights`, `check_budget` + `efficiency_rules` prompt
- Abstract response pattern for 80-90% token savings
- Git-backed persistence with full history
- Semantic search via `@xenova/transformers`
- Budget enforcement with daily/weekly/monthly limits
- Concurrent file locking
- Loop detection
