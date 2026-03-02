# Antigravity OS — System Flowcharts

A full visual reference of how every part of the system works, from MCP client connection down to SQLite writes.

---

## 1. System Overview

Three independent Node.js processes share a single SQLite database and communicate with MCP clients via stdio.

```mermaid
flowchart TB
    Client["🤖 MCP Client\nClaude Desktop / API"]

    subgraph Processes["Independent Node.js Processes"]
        MS["📚 Memory Server\n25 tools\n───────────────\nknowledge base\nsemantic search\ngit persistence\ntemporal scoring"]
        CS["⚙️  Copilot Server\n14 tools + 2 prompts\n───────────────\ncode generation\nauto-heal loop\nAST context\nbatch execution"]
        AS["📊 Analytics Server\n15 tools + 2 prompts\n───────────────\ncost tracking\nbudget enforcement\nperformance profiling\nrate limiting"]
    end

    subgraph SharedPkg["@antigravity-os/shared (utilities)"]
        DBM["DatabaseManager\ngetConnection() — ref-counted WAL"]
        LM["FileLockManager\nacquireLock() — FIFO queue"]
        WTH["withToolHandler()\nerror boundary + timer"]
        RESP["respond() / respondError()\nMCP response format"]
    end

    subgraph Storage["Persistent Storage"]
        DB[("antigravity.db\nSQLite — WAL mode\n5 s busy timeout")]
        FS["📁 .memory/\nMarkdown files"]
        GIT["🔀 .memory/.git\nauto-committed history"]
        CFG["📋 .memory/config/\nbudget.json"]
    end

    Client <-->|"stdin / stdout\nMCP JSON-RPC"| MS
    Client <-->|"stdin / stdout\nMCP JSON-RPC"| CS
    Client <-->|"stdin / stdout\nMCP JSON-RPC"| AS

    MS & CS & AS --> DBM --> DB
    MS --> LM --> FS --> GIT
    AS --> CFG

    MS & CS & AS --> WTH
    MS & CS & AS --> RESP
```

---

## 2. Tool Call Dispatch Flow

Every tool call travels the same pipeline: MCP transport → Zod validation → router → handler → formatted response.

```mermaid
flowchart TD
    A["MCP Client\nCallToolRequest {name, arguments}"] --> B["Server.setRequestHandler()\nCallToolRequestSchema"]

    B --> C["withToolHandler(log, name, fn)\nstart timer · wrap in try-catch"]

    C --> D{"switch(name)\ndispatch router"}

    D -->|"memory_*"| E["Memory Handlers\ncore / snapshot / maintenance\nanalysis / research"]
    D -->|"copilot_*"| F["Copilot Handlers\nexecute / analyze / context\ndepgraph / cache"]
    D -->|"log_* / check_* etc"| G["Analytics Handlers\ncost / performance\nadmin / health"]
    D -->|unknown| ERR1["respondError()\n'Unknown tool'"]

    E & F & G --> ZOD["XxxSchema.parse(args)\nZod v4 validation"]

    ZOD -->|valid| H["Handler function\nhandleXxx(ctx, args)\nno try-catch — bubbles up"]
    ZOD -->|invalid| ERR2["respondError()\nZodError message"]

    H --> OK["respond(data)\n{ content: [{type:'text', text: JSON}] }"]
    H -->|throws| ERR3["respondError(err.message)\n{ isError: true }"]

    OK & ERR1 & ERR2 & ERR3 --> Z["MCP Client receives response"]
```

---

## 3. Memory Write Lifecycle

Every write to the knowledge base is deduplicated, file-locked, git-committed, and semantically indexed.

```mermaid
flowchart TD
    A["memory_update / memory_log_decision\nmemory_log_lesson"] --> B

    B["Idempotency check\nSHA-256 hash of type+key+content\nLookup in idempotency_cache"] -->|"duplicate within TTL\n(decision/lesson → 24 h, others → 1 h)"| C

    C["Return cached result\n✓ no duplicate write"]

    B -->|not a duplicate| D["Resolve file path\nprojectRoot/.memory/{file_key}.md"]

    D --> E["FileLockManager.acquireLock(filePath)\nFIFO queue if path is contended"]

    E --> F["fs.appendFile / writeFile\nwrite markdown content to disk"]

    F --> G["FileLockManager.release()\nunblock next waiter in queue"]

    G --> H["GitPersistence.commitChanges()\ngit add {relative_path}\ngit commit -m '[op] description · timestamp'"]

    H --> I["TemporalMemory.upsert()\nINSERT OR REPLACE memory_entries\nentry_id=hash, confidence=1.0\ncategory, last_validated=now"]

    I --> J["SemanticSearch.indexFile(file)\nchunk → embed → store Float32 BLOB\nin semantic_chunks table"]

    J --> K["idempotency.store(hash, result, TTL)\nsave result for dedup window"]

    K --> L["respond({ success, entry_id, confidence })"]
```

---

## 4. Confidence Score Calculation

Each memory entry has a score between 0 and 1 that decays over time and is boosted by validation.

```mermaid
flowchart TD
    A["TemporalMemory.calculateConfidence(entry)"] --> B["base score = 1.0"]

    B --> C["─── TIME DECAY ───\n− min(daysSinceValidation × 0.005 , 0.5)\nmax penalty: −0.50"]

    C --> D["─── VALIDATION BOOST ───\n+ min(validation_count × 0.03 , 0.3)\nmax boost: +0.30"]

    D --> E{"category === 'core' ?"}

    E -->|yes – exempt| F["skip age penalty"]
    E -->|no| G["─── AGE PENALTY ───\n− min(ageYears × 0.1 , 0.3)\nmax penalty: −0.30"]

    F & G --> H["─── CONTRADICTION PENALTY ───\n− contradiction_count × 0.15\nno cap"]

    H --> I["clamp(score, 0.0, 1.0)"]

    I --> J{"score"}

    J -->|"≥ 0.70"| K["🟢 HIGH\nfully trusted"]
    J -->|"≥ 0.40"| L["🟡 MEDIUM\nuse with context"]
    J -->|"≥ 0.20"| M["🟠 LOW\nneeds revalidation"]
    J -->|"< 0.20"| N["🔴 OBSOLETE\ncandidate for pruning"]
```

---

## 5. Semantic Search Pipeline

Queries are embedded into a 384-dim vector and compared against every stored chunk via cosine similarity.

```mermaid
flowchart TD
    A["memory_search(query, topK=5, threshold=0.5)"] --> B["SemanticSearch.search(query, topK)"]

    B --> C{"Model loaded?\n@xenova/transformers\nXenova/all-MiniLM-L6-v2"}

    C -->|"first call — load once\n(~30 MB, cached in RAM)"| D["await pipeline('feature-extraction')\nmodel loaded into singleton"]
    C -->|already loaded| E
    C -->|load failed| Z["Fallback: keyword search\nSQLite LIKE '%query%'\non memory_entries.content"]

    D --> E["Embed query\npooling=mean · normalize=true\n→ Float32Array[384]"]

    E --> F["SELECT file, content, category, embedding\nFROM semantic_chunks"]

    F --> G["For each chunk:\nparse embedding BLOB → Float32Array\ncosineSimilarity = dot(a,b) / (∥a∥ × ∥b∥)"]

    G --> H["Sort by similarity DESC\nfilter similarity ≥ threshold\nkeep top-K"]

    H --> I["JOIN memory_entries ON file\nattach confidence score\ngroup by source file"]

    I --> J["respond({\n  results: [{content, category, confidence, similarity}],\n  query, total_found\n})"]

    Z --> J
```

---

## 6. Auto-Heal Retry Loop

When `copilot_execute_and_validate` detects issues, it feeds the errors back into the CLI automatically.

```mermaid
flowchart TD
    A["copilot_execute_and_validate({\n  prompt_file, output_file,\n  requirements[], max_retries=3\n})"] --> B

    B["LoopDetector.checkLoop(taskId)\nthrows if > 5 global attempts\non same prompt_file:output_file"] --> C

    C["CLIExecutor.execute(prompt)\nspawn copilot CLI\ncapture stdout code output"] --> D

    D["Validator.validate(code, requirements)\nESLint rules · type patterns\ncustom requirement checks"] --> E

    E{"validation.valid ?"}

    E -->|"✅ PASS"| F["respond({\n  code, validation: {valid:true},\n  heal_attempts: []\n})"]

    E -->|"❌ FAIL"| G{"attempt < max_retries\nAND source === 'cli'"}

    G -->|"no retries left"| H["respond({\n  code, validation: {valid:false},\n  heal_attempts: [{attempt, issues}],\n  healed: false\n})"]

    G -->|"retry"| I["Build correction prompt\n───────────────\n'The following code has issues:\n{code}\n'\n- [severity] Line N: message\nRewrite the code to fix ALL issues.'"]

    I --> J["attempt++\nhealAttempts.push({attempt, issues})"]

    J --> C
```

---

## 7. Budget Enforcement Flow

Every API call is checked against per-day / week / month limits before being allowed.

```mermaid
flowchart TD
    A["check_budget(operation, tokens, agent)"] --> B

    B["BudgetEnforcer.check()\nload .memory/config/budget.json\n{ daily_limit, weekly_limit, monthly_limit,\n  alert_threshold, emergency_override }"] --> C

    C{"emergency_override\nenabled?"}

    C -->|"yes — bypass all limits"| OVR["⚠️  Override active\nrespond({ allowed: true, warning: 'override active' })"]

    C -->|no| D["Calculate operation cost\n= (tokens ÷ 1000) × cost_per_token\n(default $0.015 / 1K input tokens)"]

    D --> E["SQL: SUM(cost_usd) FROM cost_log\n• today_spend  (date = today)\n• week_spend   (last 7 days)\n• month_spend  (this calendar month)"]

    E --> F["projected_daily = today_spend + operation_cost"]

    F --> G{"projected_daily\n> daily_limit_usd ?"}

    G -->|yes| DENY["❌ DENIED\n{ allowed: false,\n  reason: 'daily budget exceeded',\n  today_spend, daily_limit }"]

    G -->|no| H{"projected_daily\n> alert_threshold × daily_limit ?"}

    H -->|yes| WARN["⚠️  ALLOWED WITH WARNING\n{ allowed: true,\n  warning: 'approaching daily limit',\n  utilization_pct }"]

    H -->|no| ALLOW["✅ ALLOWED\n{ allowed: true, today_spend,\n  remaining_usd, projected_daily }"]

    WARN & ALLOW --> LOG["log_cost() — write to cost_log\nlog to performance_logs via profiler"]
```

---

## 8. Memory Staging & Atomic Commit

Stage multiple file changes in memory, then flush them all in a single git commit.

```mermaid
flowchart TD
    A["memory_stage({\n  file_key, content,\n  mode: append | replace,\n  description\n})"] --> B

    B["stagingArea.push({\n  fileKey, filePath, content,\n  mode, description, stagedAt\n})\n(in-process array, not persisted)"] --> C

    C["respond({ staged_count, files_staged })"] --> D

    D{"more writes\nto stage?"}
    D -->|"yes — stage another file"| A
    D -->|"no — ready to commit"| E

    E["memory_commit_staged({\n  commit_message, author\n})"] --> F

    F["for each change in stagingArea"] --> G

    G["FileLockManager.acquireLock(filePath)\nserialise writes to same file"] --> H

    H{"change.mode"}
    H -->|replace| I["fs.writeFile(filePath, content)\noverwrite entire file"]
    H -->|append| J["fs.appendFile(filePath, '\\n' + content)\nadd to end of file"]

    I & J --> K["FileLockManager.release()\nnext waiter unblocked"]

    K --> L{"more changes?"}
    L -->|yes| G
    L -->|no| M

    M["GitPersistence.commitAll()\ngit add -A\ngit commit -m '{message}'\n→ single atomic commit hash"] --> N

    N["TemporalMemory.logOperation()\nrecord commit in DB\ntimestamp, author, hash"] --> O

    O["stagingArea.length = 0\nalways cleared — even on partial error"] --> P

    P["respond({\n  committed: N,\n  commit_hash,\n  applied: [{file_key, mode}]\n})"]
```

---

## 9. Database Schema

All three servers share one `antigravity.db` file. Each server owns certain tables but reads freely from others.

```mermaid
erDiagram
    memory_entries {
        text    id                  PK  "SHA-256 of content"
        text    content
        text    file
        text    category                "decision|lesson|pattern|core|active"
        real    confidence
        int     validation_count
        int     contradiction_count
        text    created_at
        text    last_validated
        text    last_modified
    }

    confidence_history {
        int     id                  PK
        text    entry_id            FK
        real    old_confidence
        real    new_confidence
        text    reason
        text    timestamp
    }

    semantic_chunks {
        int     id                  PK
        text    file
        text    content
        text    category
        blob    embedding               "Float32Array[384]"
        text    indexed_at
    }

    idempotency_cache {
        text    op_hash             PK  "SHA-256 of op+key+content"
        text    result
        text    operation_type          "decision|lesson|default"
        text    expires_at
        text    created_at
    }

    cost_log {
        int     id                  PK
        text    date
        text    agent
        int     tokens
        real    cost_usd
        text    task_description
        text    timestamp
        int     duration_ms
    }

    performance_logs {
        int     id                  PK
        text    timestamp
        text    server
        text    operation
        int     duration_ms
        int     success
        text    metadata                "JSON"
    }

    rate_limits {
        text    operation           PK
        int     per_minute
        int     per_hour
        int     per_day
        text    created_at
    }

    copilot_cache {
        text    cache_key           PK  "SHA-256 of prompt"
        text    result
        text    created_at
        text    expires_at
    }

    memory_entries     ||--o{ confidence_history : "history tracked by"
    memory_entries     ||--o{ semantic_chunks    : "indexed into"
```

---

## 10. Cross-Server Data Flow

How the three servers read from each other's tables to produce integrated results.

```mermaid
flowchart LR
    subgraph MS["Memory Server"]
        ME["memory_entries\nconfidence_history\nsemantic_chunks\nidempotency_cache"]
    end

    subgraph CS["Copilot Server"]
        CC["copilot_cache\nscores\ndependency_graph"]
    end

    subgraph AS["Analytics Server"]
        CL["cost_log\nperformance_logs\nrate_limits\nrate_limit_log"]
    end

    subgraph DB["antigravity.db — WAL mode"]
        ME
        CC
        CL
    end

    MS -->|"reads scores\nfor skill analysis"| CC
    MS -->|"reads performance\nfor auto-validate"| CL

    CS -->|"reads memory_entries\nfor context injection"| ME
    CS -->|"reads cost_log\nfor budget-aware execution"| CL

    AS -->|"reads memory_entries\nfor health reports"| ME
    AS -->|"reads scores\nfor skill effectiveness"| CC

    style MS fill:#dbeafe,stroke:#3b82f6
    style CS fill:#dcfce7,stroke:#22c55e
    style AS fill:#fef9c3,stroke:#eab308
```

---

*Generated for Antigravity OS v2.2.1 — [Back to README](./README.md)*
