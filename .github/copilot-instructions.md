# Antigravity OS – Copilot Instructions

## Build, Test & Run

```bash
# Build all packages (shared must build first; workspaces handle order)
npm run build

# Unit tests (Vitest)
npx vitest run

# Single test file
npx vitest run packages/memory-server/src/temporal.test.ts

# Smoke tests – verifies all 3 servers start and expose correct tool counts
node test-all.mjs

# Watch mode
npm run test:watch
```

There is no linter configured. TypeScript strict mode (`strict: true`) is the compile-time gate.

## Architecture

### Monorepo Structure

```
packages/
  shared/          – utilities re-used by all servers
  memory-server/   – 25 tools: knowledge base, temporal confidence, git history
  copilot-server/  – 14 tools: prompt generation, CLI execution, validation, caching
  analytics-server/– 15 tools: cost tracking, budget enforcement, performance profiling
```

All three servers are independent Node.js processes that communicate via the MCP (Model Context Protocol) stdio transport. They share a single SQLite database file (`$MEMORY_DIR/antigravity.db`), coordinated by WAL mode and the shared `DatabaseManager`.

### Key Data Flow

1. An MCP client (e.g. Claude Desktop) calls a tool by name.
2. The server's main `dispatch()` switch parses args with the Zod schema and delegates to a handler function in `handlers/`.
3. Every handler receives a typed `*Context` object (defined in `handlers/types.ts`) rather than touching server state directly.
4. The handler calls domain classes (`TemporalMemory`, `BudgetEnforcer`, `SemanticSearch`, etc.) and returns `respond(data)` or `respondError(message)`.

### Memory Lifecycle

- The `.memory/` directory is a separate git repo auto-committed on every write.
- Every stored entry has a calculated confidence score (0–1) governed by:
  - **Time decay**: –0.005/day since last validation (max –0.5)
  - **Validation boost**: +0.03/validation (max +0.3)
  - **Contradiction penalty**: –0.15 per contradiction
  - **Age penalty**: –0.1/year for non-`core` entries (max –0.3)
- Categories: `decision`, `lesson`, `pattern`, `core`, `active`. The `core` category is exempt from age penalty.

### Semantic Search

Uses `@xenova/transformers` (`Xenova/all-MiniLM-L6-v2`, 384-dim) loaded lazily. Embeddings are stored as `Float32` BLOBs in the `semantic_chunks` SQLite table (not a JSON file). On first run it auto-migrates any legacy `semantic-index.json` to SQLite. Falls back gracefully to keyword search if the model fails to load.

### Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `PROJECT_ROOT` | `process.cwd()` | Root of the user's project |
| `MEMORY_DIR` | `.memory` | Path to memory store (relative to PROJECT_ROOT) |

Budget limits are configurable via `.memory/config/budget.json`.

## Key Conventions

### Adding a New Tool

Follow this exact pattern – every piece is required:

1. **Schema** (`schemas.ts`): Add a Zod schema + inferred type + tool definition entry in `getXxxToolDefinitions()`.
   - Use `z.toJSONSchema(schema)` (Zod v4 built-in) to generate `inputSchema`. Do **not** use `zod-to-json-schema` (it targets Zod v3).
   - Pass `required` as a second argument to the local `toJsonSchema()` helper, not inline.

2. **Handler** (`handlers/<file>.ts`): A plain `async function handleXxx(ctx: Context, args: TypedArgs)` — no class, no try/catch (the wrapper handles that).

3. **Barrel export** (`handlers/index.ts`): Export the new handler.

4. **Dispatch** (`index.ts`): Add a `case` in the `dispatch()` switch. Parse args with `XxxSchema.parse(args)`.

5. **Tool count**: Update the `log.info("Running on stdio", { tools: N })` call in `run()`.

6. **Docs**: Update README.md, SETUP.md, and CHANGELOG.md tool counts.

### Database Access

Always use `getConnection(dbPath)` from `@antigravity-os/shared` — never `new Database()` directly. This returns a shared, reference-counted connection with WAL mode and 5 s busy timeout already applied.

```ts
import { getConnection } from "@antigravity-os/shared";
import type Database from "better-sqlite3"; // type-only import

const db: Database.Database = getConnection(dbPath);
```

### Response Shape

All tool responses must go through these helpers from `@antigravity-os/shared`:

```ts
respond(data)        // { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] }
respondError(msg)    // { content: [{ type: "text", text: msg }], isError: true }
```

`respondError` returns **plain text**, not JSON. Do not wrap it further.

### Error Handling

Wrap top-level dispatch with `withToolHandler` from `@antigravity-os/shared`. Individual handler functions should **not** contain try/catch — bubble errors up to the wrapper.

### Logging

Use `new Logger("server-name")` from `@antigravity-os/shared`. It writes structured JSON to **stderr** (not stdout, which is reserved for MCP transport).

### Idempotency TTLs

The memory server deduplicates writes by hashing the operation key. TTLs are operation-specific:
- `"decision"` and `"lesson"` operations: 24 hours
- Everything else: 1 hour

Pass `opType` to `checkIdempotency()` / `storeIdempotency()` accordingly.

### File Write Safety

Always acquire a `FileLockManager` lock before writing to `.memory/` files to prevent interleaved writes under concurrent load:

```ts
const release = await ctx.lockManager.acquireLock(filePath);
try { /* write */ } finally { release(); }
```

### TypeScript Import Style

Use `import type` for the `better-sqlite3` `Database` type:

```ts
import type Database from "better-sqlite3";
```

Use runtime imports for the package from `@antigravity-os/shared` only (via `getConnection`).

### Schemas Are Source of Truth

The Zod schemas in each package's `schemas.ts` are the single source of truth for:
- Tool input validation (`.parse(args)` in dispatch)
- JSON Schema generation for MCP tool definitions
- TypeScript argument types (`z.infer<typeof XxxSchema>`)

Never define argument shapes separately from their Zod schema.
