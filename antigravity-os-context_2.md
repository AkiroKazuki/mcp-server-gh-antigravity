# Antigravity OS - MCP Server Implementation Context

## Project Overview: AI-Powered Development Workflow System

### Primary Goal
Build a "Manager-Worker" architecture to optimize token costs when coding:
- **Manager**: Claude Opus 4.6 in Antigravity IDE (high intelligence, high cost) - for planning, decisions, verification
- **Worker**: GitHub Copilot CLI with Opus 4.6 (free for user) - for code generation, boilerplate

### Current Setup
- **User has**: Antigravity IDE (Pro plan), GitHub Copilot CLI (Pro plan)
- **User does NOT have**: Claude Code, other AI agents (yet)
- **Environment**: **macOS** (not Ubuntu) - Antigravity IDE runs on macOS
- **User location**: Surabaya, East Java, ID

---

## System Architecture Evolution

### Initial Concept: File-Based Memory System

#### 1. Memory System (`.memory/` folder)
File-based RAG instead of long chat histories:
- **`core/`** - Tech stack, architecture (immutable)
- **`active/`** - Current context, task queue
- **`decisions/`** - Architectural decision log
- **`lessons/`** - Bugs fixed, best practices, anti-patterns
- **`prompts/`** - Templates and generated prompts
- **`snapshots/`** - Backups

#### 2. Skills System (`.skills/` folder)
Teach Antigravity how to do tasks well:
- **`copilot_mastery.md`** - How to generate perfect Copilot prompts
- **`code_review.md`** - How to verify Copilot's output
- **`memory_management.md`** - How to maintain the memory system
- **Domain-specific skills** (e.g., quantitative finance)

#### 3. Original Workflow
1. User → Antigravity (reads memory + skills) → Generates Copilot prompt → Saves to file
2. User executes: `gh copilot suggest "$(cat prompt.md)"` in terminal
3. Copilot generates code
4. Antigravity verifies output, updates memory with lessons learned

### Key Insights from Design Discussion

#### 1. One-Time Token Investment Strategy
- Spend 5-10K tokens upfront to extract knowledge from existing Antigravity chat history
- Build comprehensive memory files and skills
- **ROI**: Saves 50K+ tokens monthly

#### 2. Skills Are Critical
- **Without skills**: Copilot generates mediocre code (60% success rate)
- **With comprehensive skills**: Success rate jumps to 90%+
- Skills teach Antigravity how to prompt Copilot effectively

#### 3. Learning Loop
- Every Copilot interaction gets scored (1-5)
- Failures update skills automatically
- System improves over time through accumulated knowledge

#### 4. Missing Pieces Identified
- Git integration for memory versioning
- Copilot workspace configuration
- Security validation (prevent hardcoded secrets, etc.)
- Multi-stage task decomposition
- Backup strategy
- Conflict resolution for concurrent edits
- Progress visualization
- Cost tracking and analytics
- Semantic search (not just keyword)

### Breakthrough: MCP Server Architecture

**Why MCP servers instead of bash scripts?**
- ✅ Reusable across projects
- ✅ Accessible to any MCP client (not just Antigravity)
- ✅ Composable with other MCP servers
- ✅ Configurable via JSON (no code editing)
- ✅ Self-documenting via tool schemas
- ✅ Version controlled as npm packages
- ✅ Testable with standard interfaces

---

## MCP Server Specifications

### Server 1: Memory Server (`antigravity-memory`)

**Purpose**: Manage the `.memory/` knowledge base

**Tools to Implement**:

1. **`memory_search`**
   ```typescript
   {
     query: string,           // Search query (e.g., "authentication", "database schema")
     categories?: string[],   // ["decisions", "lessons", "patterns", "all"]
     top_k?: number          // Number of results (default: 5)
   }
   ```
   - Search across decisions, lessons, patterns
   - Return ranked results with relevance scores
   - Include file path and preview

2. **`memory_read`**
   ```typescript
   {
     file: "tech_stack" | "project_overview" | "active_context" | 
           "task_queue" | "decisions_active" | "best_practices" | 
           "bugs_fixed" | "anti_patterns"
   }
   ```
   - Read specific memory files
   - Return full file content

3. **`memory_update`**
   ```typescript
   {
     file: string,              // Which file to update
     operation: "append" | "replace" | "update_section",
     content: string,           // Content to add/update
     section?: string          // Section header (for update_section)
   }
   ```
   - Append to files
   - Replace entire file
   - Update specific sections

4. **`memory_log_decision`**
   ```typescript
   {
     title: string,             // Decision title
     what: string,              // One-sentence summary
     why: string,               // Reasoning (2-3 sentences)
     alternatives?: string[],   // Options we didn't choose
     impact?: string           // What this changes
   }
   ```
   - Structured decision logging
   - Auto-format with date
   - Append to decisions/ACTIVE.md

5. **`memory_log_lesson`**
   ```typescript
   {
     category: string,          // e.g., "Python Typing", "Database"
     type: "bug" | "pattern" | "anti_pattern",
     title: string,             // Brief description
     symptom?: string,          // What went wrong (for bugs)
     root_cause?: string,       // Why it happened (for bugs)
     fix?: string,              // How we fixed it
     prevention?: string       // How to avoid in future
   }
   ```
   - Log bugs, patterns, anti-patterns
   - Auto-categorize and format
   - Append to appropriate lesson file

6. **`memory_snapshot`**
   ```typescript
   {
     tag?: string              // Optional tag for snapshot
   }
   ```
   - Create backup of all memory files
   - Save as JSON with timestamp
   - Include metadata

---

### Server 2: Copilot Orchestrator (`antigravity-copilot`)

**Purpose**: Generate prompts, execute Copilot CLI, validate output

**Tools to Implement**:

1. **`copilot_generate_prompt`**
   ```typescript
   {
     intent: "implement_function" | "fix_bug" | "refactor" | 
             "write_tests" | "add_feature",
     file_path: string,         // Path to file to create/modify
     description: string,       // What to implement
     function_signature?: string, // Complete signature with types
     edge_cases?: string[],     // Edge cases to handle
     context?: {                // Additional context from memory
       tech_stack?: string,
       lessons?: string,
       decisions?: string
     }
   }
   ```
   - Read `.skills/copilot_mastery.md`
   - Load template from `.memory/prompts/templates/{intent}.md`
   - Fill template with provided data
   - Add context from memory
   - Save to `.memory/prompts/generated/task_{timestamp}.md`
   - Return prompt file path and preview

2. **`copilot_execute`**
   ```typescript
   {
     prompt_file: string,       // Path to prompt file
     output_file?: string      // Where Copilot should write (optional)
   }
   ```
   - Read prompt file
   - Execute: `gh copilot suggest "{prompt}"`
   - Optionally write to output_file
   - Return result and preview

3. **`copilot_validate`**
   ```typescript
   {
     file_path: string,         // File to validate
     requirements?: string[]   // Requirements from original prompt
   }
   ```
   - Security checks (hardcoded secrets, eval/exec, SQL injection)
   - Quality checks (type hints, docstrings)
   - Edge case verification
   - Constitution compliance check
   - Return: {passed: boolean, issues: [], recommendation: "APPROVE"|"REJECT"}

4. **`copilot_score`**
   ```typescript
   {
     prompt_file: string,
     output_file: string,
     score: number,            // 1-5
     issues?: string          // What went wrong (if score < 4)
   }
   ```
   - Log interaction quality
   - Save to `.memory/snapshots/prompt_scores.jsonl`
   - Enable analytics and improvement

**Security Patterns to Detect**:
```typescript
const SECURITY_PATTERNS = [
  { pattern: /password\s*=\s*["']/, message: "Hardcoded password" },
  { pattern: /api_key\s*=\s*["']/, message: "Hardcoded API key" },
  { pattern: /AUTH.*=\s*False/i, message: "Authentication disabled" },
  { pattern: /eval\(/, message: "Dangerous eval() usage" },
  { pattern: /exec\(/, message: "Dangerous exec() usage" },
  { pattern: /except:\s*$/m, message: "Bare except clause" },
];
```

**Quality Patterns to Detect**:
```typescript
const QUALITY_PATTERNS = [
  { pattern: /def \w+\([^)]*\):/, antiPattern: /->\s*\w+/, message: "Missing return type" },
  { pattern: /def \w+/, antiPattern: /"""/,  message: "Missing docstring" },
  { pattern: /print\(/, message: "Debug print statement (use logging)" },
];
```

---

### Server 3: Analytics Server (`antigravity-analytics`)

**Purpose**: Cost tracking, performance analytics, continuous improvement

**Tools to Implement**:

1. **`log_cost`**
   ```typescript
   {
     agent: "antigravity" | "copilot",
     tokens: number,
     task_description: string
   }
   ```
   - Calculate cost based on agent
   - Antigravity (Opus 4.6): $0.015 per 1K input tokens
   - Copilot: $0.00 (free)
   - Save to `.memory/snapshots/costs.jsonl`

2. **`get_cost_summary`**
   ```typescript
   {
     period?: "today" | "week" | "month" | "all"
   }
   ```
   - Parse cost logs
   - Aggregate by period
   - Calculate total cost, tokens, interaction count
   - Break down by agent
   - Calculate average cost per interaction
   - Return summary object

3. **`get_copilot_performance`**
   ```typescript
   {
     group_by?: "template" | "complexity" | "overall"
   }
   ```
   - Parse prompt_scores.jsonl
   - Calculate average score
   - Calculate success rate (score >= 4)
   - Group by specified dimension
   - Return performance metrics

4. **`get_insights`**
   ```typescript
   {}  // No parameters
   ```
   - Analyze patterns in cost and performance data
   - Identify which prompt templates work best
   - Flag skills that need updating
   - Suggest optimizations
   - Return array of insight strings

---

## Implementation Requirements

### Technology Stack
- **Language**: TypeScript/Node.js
- **MCP SDK**: `@modelcontextprotocol/sdk` version 0.5.0+
- **Transport**: stdio (standard for MCP)
- **File Operations**: Node.js `fs/promises`
- **Shell Execution**: `child_process.execAsync` for `gh copilot` commands
- **Platform**: macOS compatible

### Directory Structure
```
antigravity-os-mcp/
├── packages/
│   ├── memory-server/
│   │   ├── src/
│   │   │   └── index.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── README.md
│   ├── copilot-server/
│   │   ├── src/
│   │   │   └── index.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── README.md
│   └── analytics-server/
│       ├── src/
│       │   └── index.ts
│       ├── package.json
│       ├── tsconfig.json
│       └── README.md
├── package.json          # Optional: root monorepo config
├── README.md            # Main documentation
└── SETUP.md             # Installation guide
```

### MCP Configuration

**Location on macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "antigravity-memory": {
      "command": "node",
      "args": ["/Users/username/antigravity-os-mcp/packages/memory-server/build/index.js"],
      "env": {
        "PROJECT_ROOT": "/Users/username/my-project",
        "MEMORY_DIR": ".memory"
      }
    },
    "antigravity-copilot": {
      "command": "node",
      "args": ["/Users/username/antigravity-os-mcp/packages/copilot-server/build/index.js"],
      "env": {
        "PROJECT_ROOT": "/Users/username/my-project",
        "SKILLS_DIR": ".skills"
      }
    },
    "antigravity-analytics": {
      "command": "node",
      "args": ["/Users/username/antigravity-os-mcp/packages/analytics-server/build/index.js"],
      "env": {
        "PROJECT_ROOT": "/Users/username/my-project"
      }
    }
  }
}
```

---

## User's Project Structure

When these MCP servers are used, the user's project will have:

```
my-project/
├── .memory/
│   ├── core/
│   │   ├── tech_stack.md
│   │   ├── project_overview.md
│   │   └── architecture.md
│   ├── active/
│   │   ├── context.md
│   │   ├── task_queue.md
│   │   └── blockers.md
│   ├── decisions/
│   │   ├── ACTIVE.md
│   │   └── archive/
│   ├── lessons/
│   │   ├── bugs_fixed.md
│   │   ├── best_practices.md
│   │   └── anti_patterns.md
│   ├── prompts/
│   │   ├── templates/
│   │   │   ├── implement_function.md
│   │   │   ├── fix_bug.md
│   │   │   ├── refactor.md
│   │   │   └── write_tests.md
│   │   └── generated/
│   └── snapshots/
├── .skills/
│   ├── copilot_mastery.md
│   ├── code_review.md
│   └── memory_management.md
├── .github/
│   └── copilot-instructions.md
├── src/
└── ...
```

---

## Memory File Format Examples

### tech_stack.md
```markdown
# Tech Stack

## Language
- Python 3.12+

## Key Libraries
- NumPy 1.26+
- Pandas 2.1+

## Constraints
- Must use type hints
- Docstrings required (Google style)
- pip install --break-system-packages
```

### decisions/ACTIVE.md
```markdown
# Active Decisions

## 2024-02-14: Use PostgreSQL over SQLite
**What:** Selected PostgreSQL as primary database
**Why:** Better scalability, advanced features needed for analytics
**Alternatives:** SQLite (too limited), MongoDB (doesn't fit relational model)
**Impact:** Need Docker for local dev, more complex deployment

---
```

### lessons/bugs_fixed.md
```markdown
# Bugs Fixed

### Python Typing: Optional parameters not handled
**Symptom:** TypeError when calling function with None
**Root Cause:** Function signature had `param: str` but caller passed None
**Fix:** Changed to `param: Optional[str] = None` and added None check
**Prevention:** Always use Optional for params that can be None

---
```

### prompts/templates/implement_function.md
```markdown
# File: {filepath}

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
- [ ] All type hints present
- [ ] Docstring with Args/Returns/Raises
- [ ] Example in docstring
- [ ] Edge cases handled
- [ ] No violations of constitution
```

---

## Complete Usage Example

### Scenario: User wants to implement Sharpe ratio calculation

**Step 1: User in Antigravity IDE**
```
"I need to implement a function to calculate Sharpe ratio for my trading system"
```

**Step 2: Antigravity calls MCP tools**

```typescript
// 1. Search for relevant context
await memory_search({
  query: "sharpe ratio trading finance",
  categories: ["lessons", "patterns"],
  top_k: 5
})
// Returns: "Use NumPy for vectorization", "Always annualize metrics"

// 2. Read tech stack
await memory_read({file: "tech_stack"})
// Returns: Python 3.12, NumPy, Pandas versions

// 3. Generate Copilot prompt
await copilot_generate_prompt({
  intent: "implement_function",
  file_path: "src/metrics/sharpe.py",
  description: "Calculate annualized Sharpe ratio",
  function_signature: "def calculate_sharpe_ratio(returns: pd.Series, risk_free_rate: float = 0.02) -> float:",
  edge_cases: [
    "Empty series → raise ValueError",
    "Zero std dev → return 0.0",
    "All NaN values → raise ValueError"
  ],
  context: {
    tech_stack: "...",
    lessons: "Use NumPy for vectorization..."
  }
})
// Returns: {prompt_file: ".memory/prompts/generated/task_12345.md", ...}
```

**Step 3: User executes in terminal**
```bash
gh copilot suggest "$(cat .memory/prompts/generated/task_12345.md)" > src/metrics/sharpe.py
```

**Step 4: Antigravity validates**
```typescript
await copilot_validate({
  file_path: "src/metrics/sharpe.py",
  requirements: [
    "Type hints on all parameters",
    "Docstring with example",
    "Handle zero std dev case"
  ]
})
// Returns: {passed: true, issues: [], recommendation: "APPROVE"}
```

**Step 5: Log the interaction**
```typescript
await memory_log_lesson({
  category: "Finance Metrics",
  type: "pattern",
  title: "Sharpe ratio implementation",
  pattern: "Vectorized calculation using NumPy",
  when_to_use: "Financial metric calculations"
})

await log_cost({
  agent: "antigravity",
  tokens: 2500,
  task_description: "Implement Sharpe ratio function"
})
```

---

## Critical Production Features (Must-Have for Production Grade)

### 9. Safety Valve: Budget & Hard Limits

**Problem**: Analytics tracks costs but doesn't PREVENT runaway spending. An AI agent could burn through credits while you're away.

**Solution**: Budget enforcement middleware that blocks execution when limits exceeded.

**New Tool for Analytics Server**: `check_budget`
```typescript
{
  name: "check_budget",
  description: "Check if budget allows this operation. Returns error if budget exceeded.",
  inputSchema: {
    type: "object",
    properties: {
      estimated_tokens: {
        type: "number",
        description: "Estimated tokens for this operation"
      },
      agent: {
        type: "string",
        enum: ["antigravity", "copilot"]
      }
    },
    required: ["estimated_tokens", "agent"]
  }
}
```

**Implementation in Analytics Server**:
```typescript
class BudgetEnforcer {
  private readonly DAILY_LIMIT_USD = 2.00;  // Configurable
  private readonly COSTS = {
    antigravity_input: 0.015,   // per 1K tokens
    antigravity_output: 0.075,  // per 1K tokens
    copilot: 0.0                // Free
  };
  
  async checkBudget(estimatedTokens: number, agent: string): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    
    // Calculate today's spend from logs
    const logFile = path.join(
      process.env.PROJECT_ROOT!,
      '.memory/snapshots/costs.jsonl'
    );
    
    const todaySpend = await this.getTodaySpend(logFile, today);
    
    // Calculate this operation's cost
    const operationCost = agent === 'antigravity' 
      ? (estimatedTokens / 1000) * this.COSTS.antigravity_input
      : 0;
    
    const projectedTotal = todaySpend + operationCost;
    
    if (projectedTotal > this.DAILY_LIMIT_USD) {
      throw new Error(
        `BUDGET EXCEEDED: Today's spend $${todaySpend.toFixed(2)} + ` +
        `operation $${operationCost.toFixed(2)} = $${projectedTotal.toFixed(2)} ` +
        `exceeds daily limit of $${this.DAILY_LIMIT_USD}. ` +
        `Manual override required. Edit budget in .memory/config/budget.json`
      );
    }
    
    // Log the check
    console.error(`Budget OK: $${projectedTotal.toFixed(2)}/$${this.DAILY_LIMIT_USD}`);
  }
  
  private async getTodaySpend(logFile: string, today: string): Promise<number> {
    try {
      const content = await fs.readFile(logFile, 'utf-8');
      const lines = content.trim().split('\n');
      
      let total = 0;
      for (const line of lines) {
        const entry = JSON.parse(line);
        if (entry.date === today) {
          total += entry.cost_usd;
        }
      }
      
      return total;
    } catch {
      return 0;  // No log file yet
    }
  }
}

// Integration: ALL expensive operations must check budget first
async handleToolCall(name: string, args: any) {
  // Check budget before ANY Antigravity-expensive operation
  if (name === 'copilot_generate_prompt' || name === 'memory_search') {
    await this.budgetEnforcer.checkBudget(2000, 'antigravity');
  }
  
  // Proceed with operation...
}
```

**Configuration File**: `.memory/config/budget.json`
```json
{
  "daily_limit_usd": 2.00,
  "weekly_limit_usd": 10.00,
  "monthly_limit_usd": 30.00,
  "alert_threshold": 0.80,
  "costs": {
    "antigravity_input": 0.015,
    "antigravity_output": 0.075,
    "copilot": 0.0
  },
  "emergency_override": false
}
```

**Benefits**:
- Prevents runaway costs (potentially saves hundreds of dollars)
- Configurable limits per day/week/month
- Can set alert threshold (e.g., warn at 80%)
- Emergency override available

---

### 10. Git-Backed Persistence: The Time Machine

**Problem**: Memory files can be corrupted, accidentally overwritten, or ruined by AI hallucinations with no recovery option.

**Solution**: Automatic git commit after every memory update. Every AI decision becomes part of an auditable history.

**Implementation in Memory Server**:
```typescript
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

class GitPersistence {
  private projectRoot: string;
  private memoryPath: string;
  
  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.memoryPath = path.join(projectRoot, '.memory');
    this.initGit();
  }
  
  private async initGit(): Promise<void> {
    try {
      // Check if .memory is in git
      await execAsync('git rev-parse --git-dir', { cwd: this.memoryPath });
    } catch {
      // Initialize git for .memory directory
      await execAsync('git init', { cwd: this.memoryPath });
      await execAsync('git add .', { cwd: this.memoryPath });
      await execAsync(
        'git commit -m "Initial memory state"',
        { cwd: this.memoryPath }
      );
      console.error('Initialized git for .memory/');
    }
  }
  
  async commitChanges(
    file: string,
    operation: string,
    description: string
  ): Promise<void> {
    try {
      // Stage the changed file
      await execAsync(`git add "${file}"`, { cwd: this.memoryPath });
      
      // Commit with structured message
      const timestamp = new Date().toISOString();
      const message = `[${operation}] ${description}\n\nTimestamp: ${timestamp}`;
      
      await execAsync(
        `git commit -m "${message.replace(/"/g, '\\"')}"`,
        { cwd: this.memoryPath }
      );
      
      console.error(`Committed: ${file}`);
    } catch (error: any) {
      // If no changes, that's OK
      if (!error.message.includes('nothing to commit')) {
        console.error(`Git commit failed: ${error.message}`);
      }
    }
  }
  
  async getHistory(file: string, limit: number = 10): Promise<any[]> {
    try {
      const { stdout } = await execAsync(
        `git log --oneline -${limit} -- "${file}"`,
        { cwd: this.memoryPath }
      );
      
      return stdout.trim().split('\n').map(line => {
        const [hash, ...msgParts] = line.split(' ');
        return {
          hash,
          message: msgParts.join(' ')
        };
      });
    } catch {
      return [];
    }
  }
  
  async rollback(file: string, commitHash: string): Promise<void> {
    await execAsync(
      `git checkout ${commitHash} -- "${file}"`,
      { cwd: this.memoryPath }
    );
    
    // Commit the rollback
    await this.commitChanges(
      file,
      'ROLLBACK',
      `Rolled back ${file} to ${commitHash}`
    );
  }
  
  async getDiff(file: string, commitHash?: string): Promise<string> {
    const target = commitHash ? `${commitHash} HEAD` : 'HEAD~1 HEAD';
    const { stdout } = await execAsync(
      `git diff ${target} -- "${file}"`,
      { cwd: this.memoryPath }
    );
    return stdout;
  }
}

// Integration with memory_update
async updateMemoryFile(args: any) {
  const { file, operation, content } = args;
  const filepath = fileMap[file];
  
  // Perform the update
  // ... (existing code)
  
  // Commit the change to git
  await this.gitPersistence.commitChanges(
    filepath,
    operation.toUpperCase(),
    `Updated ${file}: ${content.slice(0, 50)}...`
  );
  
  return { success: true };
}
```

**New Tools for Memory Server**:
```typescript
{
  name: "memory_history",
  description: "Get git history of a memory file to see what the AI learned over time",
  inputSchema: {
    type: "object",
    properties: {
      file: {
        type: "string",
        enum: ["tech_stack", "decisions_active", "best_practices", "bugs_fixed", ...]
      },
      limit: {
        type: "number",
        description: "Number of commits to show (default: 10)"
      }
    },
    required: ["file"]
  }
}

{
  name: "memory_rollback",
  description: "Rollback a memory file to a previous commit. Use when AI made a mistake.",
  inputSchema: {
    type: "object",
    properties: {
      file: string,
      commit_hash: {
        type: "string",
        description: "Git commit hash from memory_history"
      }
    },
    required: ["file", "commit_hash"]
  }
}

{
  name: "memory_diff",
  description: "Show what changed in a memory file",
  inputSchema: {
    type: "object",
    properties: {
      file: string,
      commit_hash: {
        type: "string",
        description: "Optional: compare to specific commit"
      }
    },
    required: ["file"]
  }
}
```

**Benefits**:
- Complete audit trail of all AI decisions
- Easy recovery from AI mistakes or hallucinations
- Can analyze what the AI learned over time
- Supports collaborative workflows (team can see AI changes)
- Enables "time travel" debugging

---

### 11. Semantic Hybrid Search: The Brain Upgrade

**Problem**: Keyword search misses semantically similar content. If Claude searches for "how to handle users" but memory says "Authentication Logic", the search fails.

**Solution**: Vector embeddings for semantic search using lightweight local models. No API calls, runs entirely offline.

**Dependencies**:
```json
{
  "dependencies": {
    "sqlite-vss": "^0.1.2",
    "@xenova/transformers": "^2.6.0",
    "better-sqlite3": "^9.2.0"
  }
}
```

**Implementation in Memory Server**:
```typescript
import { pipeline } from '@xenova/transformers';
import Database from 'better-sqlite3';

class SemanticSearch {
  private db: Database.Database;
  private embedder: any;
  private initialized: boolean = false;
  
  constructor(projectRoot: string) {
    const dbPath = path.join(projectRoot, '.memory', 'semantic.db');
    this.db = new Database(dbPath);
  }
  
  async initialize() {
    if (this.initialized) return;
    
    console.error('Loading embedding model (one-time, ~30MB)...');
    
    // Load embedding model (runs locally, no API calls)
    this.embedder = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2'  // Fast, lightweight, good quality
    );
    
    // Initialize VSS extension
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memory_embeddings USING vss0(
        embedding(384)  -- Dimension of all-MiniLM-L6-v2
      );
      
      CREATE TABLE IF NOT EXISTS memory_chunks (
        id INTEGER PRIMARY KEY,
        file TEXT,
        content TEXT,
        category TEXT,
        indexed_at TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_chunks_category ON memory_chunks(category);
    `);
    
    this.initialized = true;
    console.error('Semantic search ready');
  }
  
  async indexMemory() {
    await this.initialize();
    
    // Clear old index
    this.db.exec(`
      DELETE FROM memory_embeddings;
      DELETE FROM memory_chunks;
    `);
    
    // Index all memory files
    const files = await glob(
      path.join(process.env.PROJECT_ROOT!, '.memory/**/*.md')
    );
    
    let totalChunks = 0;
    
    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8');
      const chunks = this.chunkText(content, 500); // 500 chars per chunk
      
      for (const chunk of chunks) {
        // Generate embedding
        const output = await this.embedder(chunk, {
          pooling: 'mean',
          normalize: true
        });
        
        const embedding = Array.from(output.data);
        
        // Store chunk
        const result = this.db.prepare(`
          INSERT INTO memory_chunks (file, content, category, indexed_at)
          VALUES (?, ?, ?, ?)
        `).run(
          path.relative(process.env.PROJECT_ROOT!, file),
          chunk,
          this.categorizeFile(file),
          new Date().toISOString()
        );
        
        // Store embedding
        this.db.prepare(`
          INSERT INTO memory_embeddings (rowid, embedding)
          VALUES (?, vss_vector(?))
        `).run(result.lastInsertRowid, JSON.stringify(embedding));
        
        totalChunks++;
      }
    }
    
    console.error(`Indexed ${totalChunks} chunks from ${files.length} files`);
  }
  
  async semanticSearch(query: string, topK: number = 5): Promise<any[]> {
    await this.initialize();
    
    // Generate query embedding
    const queryOutput = await this.embedder(query, {
      pooling: 'mean',
      normalize: true
    });
    
    const queryEmbedding = Array.from(queryOutput.data);
    
    // Search using VSS (Vector Similarity Search)
    const results = this.db.prepare(`
      SELECT 
        m.file,
        m.content,
        m.category,
        vss_distance(e.embedding, vss_vector(?)) as distance
      FROM memory_embeddings e
      JOIN memory_chunks m ON m.id = e.rowid
      WHERE vss_search(e.embedding, vss_vector(?))
      LIMIT ?
    `).all(
      JSON.stringify(queryEmbedding),
      JSON.stringify(queryEmbedding),
      topK
    );
    
    return results.map(r => ({
      ...r,
      similarity: (1 - r.distance).toFixed(3)  // Convert distance to similarity score
    }));
  }
  
  private chunkText(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    const paragraphs = text.split('\n\n');
    
    let currentChunk = '';
    
    for (const para of paragraphs) {
      if ((currentChunk + para).length > maxLength) {
        if (currentChunk) chunks.push(currentChunk.trim());
        currentChunk = para;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + para;
      }
    }
    
    if (currentChunk) chunks.push(currentChunk.trim());
    
    return chunks.filter(c => c.length > 50); // Skip tiny chunks
  }
  
  private categorizeFile(filepath: string): string {
    if (filepath.includes('/decisions/')) return 'decision';
    if (filepath.includes('/lessons/')) return 'lesson';
    if (filepath.includes('/core/')) return 'core';
    if (filepath.includes('/active/')) return 'active';
    return 'other';
  }
}

// Enhanced memory_search tool (hybrid approach)
async searchMemory(query: string, categories: string[], topK: number) {
  try {
    // Try semantic search first (better results)
    const semanticResults = await this.semanticSearch.semanticSearch(query, topK);
    
    if (semanticResults.length > 0) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            method: "semantic",
            results: semanticResults.map(r => ({
              file: r.file,
              content: r.content.slice(0, 300) + '...',
              category: r.category,
              similarity: r.similarity
            }))
          }, null, 2)
        }]
      };
    }
  } catch (error) {
    console.error('Semantic search failed, falling back to keyword search');
  }
  
  // Fallback to keyword search
  return this.keywordSearch(query, categories, topK);
}
```

**New Tools for Memory Server**:
```typescript
{
  name: "reindex_memory",
  description: "Rebuild semantic search index. Run after major memory changes or initial setup.",
  inputSchema: {
    type: "object",
    properties: {
      force: {
        type: "boolean",
        description: "Force reindex even if recently indexed"
      }
    }
  }
}
```

**Benefits**:
- Finds relevant content by meaning, not just exact words
- Reduces hallucinations (AI finds correct context more reliably)
- Works offline (no API calls, privacy-friendly)
- Fast (<100ms for most queries)
- Automatic: indexes in background

**Token Savings**: Better context = fewer retries = 20-30% reduction

---

### 12. Concurrent Write Locking: Parallel Safety

**Problem**: Batch execution can corrupt files if multiple tasks try to write to the same file simultaneously.

**Solution**: File-level locking with queue system. Parallel tasks that don't conflict run simultaneously; conflicting tasks run sequentially.

**Implementation in Memory Server**:
```typescript
class FileLockManager {
  private locks: Map<string, Promise<void>> = new Map();
  private queues: Map<string, Array<() => void>> = new Map();
  
  async acquireLock(filepath: string): Promise<() => void> {
    // Normalize path
    const normalizedPath = path.resolve(filepath);
    
    // If file is already locked, wait in queue
    while (this.locks.has(normalizedPath)) {
      await new Promise<void>(resolve => {
        const queue = this.queues.get(normalizedPath) || [];
        queue.push(resolve);
        this.queues.set(normalizedPath, queue);
      });
    }
    
    // Create lock
    let releaseLock: () => void;
    const lockPromise = new Promise<void>(resolve => {
      releaseLock = resolve;
    });
    
    this.locks.set(normalizedPath, lockPromise);
    
    console.error(`Lock acquired: ${path.basename(normalizedPath)}`);
    
    // Return release function
    return () => {
      this.locks.delete(normalizedPath);
      console.error(`Lock released: ${path.basename(normalizedPath)}`);
      
      // Wake up next in queue
      const queue = this.queues.get(normalizedPath) || [];
      const next = queue.shift();
      if (next) {
        next();
      } else {
        this.queues.delete(normalizedPath);
      }
    };
  }
  
  async withLock<T>(
    filepath: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const release = await this.acquireLock(filepath);
    
    try {
      return await operation();
    } finally {
      release();
    }
  }
  
  isLocked(filepath: string): boolean {
    const normalizedPath = path.resolve(filepath);
    return this.locks.has(normalizedPath);
  }
  
  getQueueLength(filepath: string): number {
    const normalizedPath = path.resolve(filepath);
    return (this.queues.get(normalizedPath) || []).length;
  }
}

// Integration with memory_update
async updateMemoryFile(args: any) {
  const { file, operation, content } = args;
  const filepath = path.join(this.memoryPath, fileMap[file]);
  
  // Acquire lock before updating
  return await this.lockManager.withLock(filepath, async () => {
    // Perform update
    if (operation === 'append') {
      await fs.appendFile(filepath, '\n' + content);
    } else if (operation === 'replace') {
      await fs.writeFile(filepath, content);
    } else if (operation === 'update_section') {
      // ... section update logic
    }
    
    // Commit to git (inside lock to ensure atomicity)
    await this.gitPersistence.commitChanges(
      filepath,
      operation.toUpperCase(),
      `${operation} ${file}`
    );
    
    return { 
      success: true,
      file: filepath
    };
  });
}
```

**Enhanced Batch Execute in Copilot Server**:
```typescript
async batchExecute(tasks: Task[]) {
  // Analyze task conflicts
  const fileGroups = new Map<string, Task[]>();
  
  for (const task of tasks) {
    const file = path.resolve(task.output_file);
    const group = fileGroups.get(file) || [];
    group.push(task);
    fileGroups.set(file, group);
  }
  
  // Separate conflicting and non-conflicting tasks
  const parallelTasks: Task[] = [];
  const sequentialGroups: Task[][] = [];
  
  for (const [file, fileTasks] of fileGroups) {
    if (fileTasks.length === 1) {
      parallelTasks.push(fileTasks[0]);
    } else {
      sequentialGroups.push(fileTasks);
    }
  }
  
  console.error(
    `Batch: ${parallelTasks.length} parallel, ` +
    `${sequentialGroups.length} sequential groups`
  );
  
  // Execute parallel tasks
  const parallelPromises = parallelTasks.map(task => 
    this.executeCopilot(task)
  );
  
  // Execute sequential groups (one at a time per group)
  const sequentialPromises = sequentialGroups.map(async (group) => {
    const results = [];
    for (const task of group) {
      results.push(await this.executeCopilot(task));
    }
    return results;
  });
  
  // Wait for all
  const [parallelResults, sequentialResults] = await Promise.all([
    Promise.allSettled(parallelPromises),
    Promise.allSettled(sequentialPromises)
  ]);
  
  const allResults = [
    ...parallelResults,
    ...sequentialResults.flatMap(r => 
      r.status === 'fulfilled' ? r.value : []
    )
  ];
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        total: tasks.length,
        succeeded: allResults.filter(r => r.status === 'fulfilled').length,
        failed: allResults.filter(r => r.status === 'rejected').length,
        conflicts_detected: sequentialGroups.length,
        execution_time: '...'
      }, null, 2)
    }]
  };
}
```

**New Tool for Memory Server**: `show_locks`
```typescript
{
  name: "show_locks",
  description: "Show currently locked files and queue status (for debugging)",
  inputSchema: {
    type: "object",
    properties: {}
  }
}

// Implementation
async showLocks() {
  const locks = Array.from(this.lockManager.locks.keys()).map(filepath => ({
    file: path.relative(this.projectRoot, filepath),
    queue_length: this.lockManager.getQueueLength(filepath)
  }));
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        active_locks: locks.length,
        locks: locks
      }, null, 2)
    }]
  };
}
```

**Benefits**:
- Prevents file corruption from concurrent writes
- Maintains data integrity
- Supports true parallel execution (non-conflicting tasks run simultaneously)
- Queue system ensures fairness (FIFO)
- Debugging visibility (can see what's locked)

---

## Expected Deliverables

### 1. Memory Server (`packages/memory-server/`)
**Files needed**:
- `src/index.ts` - Full implementation with all 6 tools
- `package.json` - Dependencies and build scripts
- `tsconfig.json` - TypeScript configuration
- `README.md` - API documentation and usage

**Key features**:
- Efficient search implementation (index by headers/sections)
- Safe file operations (atomic writes, proper directory creation)
- Snapshot functionality with JSON format
- Error handling for missing files
- Path resolution for macOS

### 2. Copilot Server (`packages/copilot-server/`)
**Files needed**:
- `src/index.ts` - Full implementation with all 4 tools
- `package.json` - Dependencies and build scripts
- `tsconfig.json` - TypeScript configuration
- `README.md` - Usage examples and validation patterns

**Key features**:
- Template system for prompt generation
- Variable substitution in templates
- Security validation with regex patterns
- Quality validation
- Integration with `gh` CLI via child_process
- Error handling for missing templates and CLI failures

### 3. Analytics Server (`packages/analytics-server/`)
**Files needed**:
- `src/index.ts` - Full implementation with all 4 tools
- `package.json` - Dependencies and build scripts
- `tsconfig.json` - TypeScript configuration
- `README.md` - Analytics documentation

**Key features**:
- JSONL log parsing
- Date filtering for periods
- Cost calculation with configurable rates
- Performance aggregation
- Insight generation from patterns

### 4. Root Level Documentation
**Files needed**:
- `README.md` - Project overview, architecture, installation
- `SETUP.md` - Step-by-step setup for macOS
- `package.json` (optional) - Monorepo configuration with workspaces

---

## Common Requirements for All Servers

### TypeScript Configuration (tsconfig.json)
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./build",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

### Package.json Structure
```json
{
  "name": "@antigravity-os/[server-name]",
  "version": "1.0.0",
  "type": "module",
  "bin": {
    "antigravity-[server-name]": "./build/index.js"
  },
  "scripts": {
    "build": "tsc",
    "prepare": "npm run build",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^0.5.0"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "typescript": "^5.3.3"
  }
}
```

### MCP Server Implementation Pattern
```typescript
#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

class MyMCPServer {
  private server: Server;
  
  constructor() {
    this.server = new Server(
      {
        name: "server-name",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
    
    this.setupToolHandlers();
  }
  
  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [/* tool definitions */],
    }));
    
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      // Handle tool calls
    });
  }
  
  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Server running on stdio");
  }
}

const server = new MyMCPServer();
server.run().catch(console.error);
```

### Error Handling Pattern
```typescript
try {
  // Operation
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
} catch (error: any) {
  return {
    content: [
      {
        type: "text",
        text: `Error: ${error.message}`,
      },
    ],
    isError: true,
  };
}
```

---

## Installation & Setup Instructions

### Prerequisites
1. **Node.js 18+** installed
2. **GitHub CLI** (`gh`) installed and authenticated
3. **Antigravity IDE** or **Claude Desktop**

### Installation Steps
```bash
# 1. Clone or create the repository
mkdir antigravity-os-mcp
cd antigravity-os-mcp

# 2. Install each server
cd packages/memory-server
npm install
npm run build

cd ../copilot-server
npm install
npm run build

cd ../analytics-server
npm install
npm run build

# 3. Configure MCP client
# Edit: ~/Library/Application Support/Claude/claude_desktop_config.json
# Add the configuration shown above

# 4. Initialize a project
cd ~/my-project
mkdir -p .memory/{core,active,decisions,lessons,prompts/templates,snapshots}
mkdir -p .skills

# 5. Restart Claude Desktop or Antigravity IDE
```

### Testing the Setup
```bash
# After restart, in Antigravity IDE:
# Try: "List available MCP tools"
# You should see all tools from the 3 servers

# Try: "Search memory for 'test'"
# Should execute memory_search tool

# Try: "Read tech stack"
# Should execute memory_read tool
```

---

## Success Criteria

### Functional Requirements
- ✅ All 3 servers compile without errors (`npm run build` succeeds)
- ✅ Can be installed via `npm install`
- ✅ Work with Antigravity IDE on macOS
- ✅ All tools return properly formatted MCP responses
- ✅ Error handling is comprehensive (no uncaught exceptions)
- ✅ File operations are safe (mkdir -p, atomic writes, proper locking)
- ✅ Shell commands work on macOS (`gh` CLI integration)
- ✅ Validation patterns catch common security and quality issues

### Code Quality
- ✅ TypeScript types are properly defined
- ✅ All environment variables are documented
- ✅ Error messages are helpful and actionable
- ✅ Code is well-commented
- ✅ Follows consistent style

### Documentation
- ✅ README.md explains architecture and usage
- ✅ SETUP.md provides step-by-step installation
- ✅ Each server has individual README with API docs
- ✅ Tool schemas are clear and complete
- ✅ Examples are provided for common use cases

### Platform Compatibility
- ✅ File paths work on macOS (use `path.join`, not hardcoded `/`)
- ✅ Shell commands use proper escaping
- ✅ No Linux-specific dependencies
- ✅ Works with both Antigravity IDE and Claude Desktop

---

## Additional Context

### Why This System Exists
The core problem: Long conversation histories in Antigravity burn tokens and lose context over time. By extracting knowledge into files (`.memory/`) and teaching Antigravity how to use Copilot effectively (`.skills/`), we:
1. Reduce token usage by 90%
2. Improve code quality through accumulated lessons
3. Create a reusable system that works across projects

### Token Economics
- **Before**: 50K tokens/day × 20 days = 1M tokens/month = $15-75
- **After**: 5K tokens/day × 20 days = 100K tokens/month = $1.50-7.50
- **Savings**: 90% reduction in costs

### Quality Improvement
- **Before**: 60% of Copilot outputs need revision
- **After**: 90% success rate on first try
- **Time Saved**: 3-5 hours/week

---

---

## Critical MCP Optimizations (Research-Based)

### 1. Abstract Response Pattern (Token Saver)

**Problem**: When MCP tools return full code, Claude sees all that code in context window, burning expensive input tokens.

**Solution**: Return only success hashes/summaries instead of full output.

**Implementation in Copilot Server**:
```typescript
// ❌ BAD: Returns full code (burns tokens)
return {
  content: [{
    type: "text",
    text: generatedCode  // 500 lines = 2000 tokens wasted
  }]
};

// ✅ GOOD: Returns summary only
return {
  content: [{
    type: "text",
    text: JSON.stringify({
      status: "success",
      file: outputFile,
      lines_added: 47,
      summary: "Implemented JWT auth with bcrypt password hashing",
      preview: generatedCode.slice(0, 200) + "..." // First 200 chars only
    })
  }]
};
```

**Token Savings**: 80-90% reduction on tool responses

---

### 2. State-Based Memory with Context Summarization

**Problem**: Claude re-reads entire memory system each time, wasting tokens.

**Solution**: MCP server maintains compressed state and returns high-level summaries.

**New Tool for Memory Server**: `get_context_summary`
```typescript
{
  name: "get_context_summary",
  description: "Get compressed project state summary (uses 90% fewer tokens than reading full memory)",
  inputSchema: {
    type: "object",
    properties: {
      focus_area?: string  // Optional: "architecture", "recent_changes", "blockers"
    }
  }
}
```

**Implementation**:
```typescript
async getContextSummary(focusArea?: string) {
  // Instead of returning full files, return compressed summaries
  const summary = {
    tech_stack: {
      language: "Python 3.12",
      key_libs: ["NumPy", "Pandas", "FastAPI"],
      constraints: ["Type hints required", "Google-style docstrings"]
    },
    current_goal: "Implement backtesting engine MVP",
    recent_completions: ["Data pipeline", "Strategy interface"],
    active_blockers: [],
    last_5_decisions: [
      "2024-02-14: Use PostgreSQL for scalability",
      "2024-02-13: Async-first architecture"
    ],
    key_lessons: [
      "Always use Optional[] for nullable params",
      "Vectorize with NumPy for performance"
    ]
  };
  
  return {
    content: [{
      type: "text", 
      text: JSON.stringify(summary, null, 2)
    }]
  };
}
```

**Token Savings**: Reading 5KB of memory files → 500 byte summary = 90% reduction

---

### 3. Output Filtering (CLI Junk Removal)

**Problem**: Copilot CLI outputs verbose messages ("Thinking...", "Scanning files...") that waste tokens.

**Solution**: Strip everything except actual code/errors before returning to Claude.

**Implementation in Copilot Server**:
```typescript
private stripCliJunk(output: string): string {
  // Remove common CLI noise
  const junkPatterns = [
    /^Thinking\.\.\./gm,
    /^Scanning files\.\.\./gm,
    /^GitHub Copilot:/gm,
    /^Here is your code:/gm,
    /^```[a-z]*\n/g,  // Remove markdown code fences
    /\n```$/g,
    /^\/\/ Generated by GitHub Copilot/gm
  ];
  
  let cleaned = output;
  for (const pattern of junkPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  return cleaned.trim();
}

async executeCopilot(args: any) {
  const { stdout } = await execAsync(`gh copilot suggest ...`);
  
  const cleanedCode = this.stripCliJunk(stdout);
  
  // Write to file
  await fs.writeFile(outputFile, cleanedCode);
  
  // Return SUMMARY, not full code (Abstract Response Pattern)
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        status: "success",
        file: outputFile,
        summary: "Generated function with type hints and docstring",
        line_count: cleanedCode.split('\n').length
      })
    }]
  };
}
```

**Token Savings**: 40-60% reduction in CLI output

---

### 4. Dry Run / Preview Changes

**Problem**: AI might make mistakes; catching them early saves token-burning fix cycles.

**Solution**: Add preview tool that shows diffs before committing changes.

**New Tool for Copilot Server**: `copilot_preview`
```typescript
{
  name: "copilot_preview",
  description: "Preview what Copilot will generate WITHOUT writing to disk. Returns a diff preview.",
  inputSchema: {
    type: "object",
    properties: {
      prompt_file: string,
      target_file: string  // File that would be modified
    }
  }
}
```

**Implementation**:
```typescript
async previewChanges(promptFile: string, targetFile: string) {
  // Generate code to temp file
  const tempFile = `/tmp/copilot_preview_${Date.now()}.py`;
  await this.executeCopilot({ prompt_file: promptFile, output_file: tempFile });
  
  // Generate diff
  const { stdout: diff } = await execAsync(`diff -u ${targetFile} ${tempFile} || true`);
  
  // Clean up temp
  await fs.unlink(tempFile);
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        diff_preview: diff.slice(0, 1000),  // First 1000 chars
        changes: {
          lines_added: (diff.match(/^\+/gm) || []).length,
          lines_removed: (diff.match(/^-/gm) || []).length
        },
        recommendation: "Review diff, then call copilot_execute to apply"
      })
    }]
  };
}
```

**Token Savings**: Prevents expensive "oops, fix that" cycles

---

### 5. Batch Execution Engine

**Problem**: Antigravity can only do one thing at a time; 10 sequential tasks = 10x tokens.

**Solution**: MCP server executes multiple tasks in parallel.

**New Tool for Copilot Server**: `copilot_batch_execute`
```typescript
{
  name: "copilot_batch_execute",
  description: "Execute multiple Copilot prompts in parallel. Saves tokens by batching.",
  inputSchema: {
    type: "object",
    properties: {
      tasks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            prompt_file: string,
            output_file: string,
            priority?: "high" | "low"
          }
        }
      }
    }
  }
}
```

**Implementation**:
```typescript
async batchExecute(tasks: Task[]) {
  // Execute all tasks in parallel
  const results = await Promise.allSettled(
    tasks.map(task => this.executeCopilot(task))
  );
  
  // Return compressed summary
  const summary = results.map((r, i) => ({
    file: tasks[i].output_file,
    status: r.status === "fulfilled" ? "success" : "failed",
    error: r.status === "rejected" ? r.reason.message : undefined
  }));
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        total: tasks.length,
        succeeded: summary.filter(s => s.status === "success").length,
        failed: summary.filter(s => s.status === "failed").length,
        details: summary
      })
    }]
  };
}
```

**Token Savings**: 10 tasks = 1 tool call instead of 10 = 90% token reduction

---

### 6. Intent Guardrails (Loop Detection)

**Problem**: Claude might get stuck in expensive fix loops ("Try again", "Fix that error", repeat...).

**Solution**: MCP detects loops and returns hard stop.

**Implementation Across All Servers**:
```typescript
class LoopDetector {
  private attempts: Map<string, number> = new Map();
  
  checkLoop(taskId: string, maxAttempts: number = 3): void {
    const count = (this.attempts.get(taskId) || 0) + 1;
    this.attempts.set(taskId, count);
    
    if (count > maxAttempts) {
      throw new Error(
        `Loop detected: ${taskId} attempted ${count} times. ` +
        `Manual intervention required to save tokens. ` +
        `Review error, update prompt, or check lessons.`
      );
    }
  }
  
  reset(taskId: string): void {
    this.attempts.delete(taskId);
  }
}

// Usage in copilot_execute
async executeCopilot(args: any) {
  const taskId = `${args.prompt_file}:${args.output_file}`;
  
  try {
    this.loopDetector.checkLoop(taskId);
    
    // Execute...
    const result = await this.doExecute(args);
    
    // Success - reset counter
    this.loopDetector.reset(taskId);
    
    return result;
  } catch (error) {
    // Loop detected or execution failed
    throw error;
  }
}
```

**Token Savings**: Prevents runaway costs from stuck tasks

---

### 7. Smart Prompt Injection (Effort Control)

**Problem**: Claude might over-explain or be too verbose in responses.

**Solution**: Use MCP `prompts` feature to inject behavioral rules.

**Implementation** (add to each server's initialization):
```typescript
this.server = new Server(
  {
    name: "antigravity-copilot",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
      prompts: {}  // Enable prompts
    },
  }
);

// Add prompt handler
this.server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: [
    {
      name: "efficiency_rules",
      description: "Token optimization guidelines",
      arguments: []
    }
  ]
}));

this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  if (request.params.name === "efficiency_rules") {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `EFFICIENCY RULES FOR THIS SESSION:
1. When delegating to Copilot, use SHORT commands only
2. Do NOT explain what you're doing unless there's a CRITICAL error
3. Return summaries, not full code (save user's tokens)
4. If something fails twice, stop and ask for manual intervention
5. Use batch operations when possible (batch_execute)
6. Read context_summary instead of full memory files

Token budget awareness: User pays $25/MTok for your outputs.`
          }
        }
      ]
    };
  }
});
```

---

### 8. Local State Database (Advanced)

**Problem**: JSON files don't scale; querying is inefficient.

**Solution**: Use SQLite for structured memory storage.

**New Dependency**: `better-sqlite3`

**Schema**:
```sql
CREATE TABLE decisions (
  id INTEGER PRIMARY KEY,
  date TEXT,
  title TEXT,
  what TEXT,
  why TEXT,
  alternatives TEXT,
  impact TEXT
);

CREATE TABLE lessons (
  id INTEGER PRIMARY KEY,
  category TEXT,
  type TEXT,  -- 'bug', 'pattern', 'anti_pattern'
  title TEXT,
  symptom TEXT,
  root_cause TEXT,
  fix TEXT,
  prevention TEXT
);

CREATE INDEX idx_lessons_category ON lessons(category);
CREATE INDEX idx_lessons_type ON lessons(type);
```

**Implementation in Memory Server**:
```typescript
import Database from 'better-sqlite3';

class MemoryServer {
  private db: Database.Database;
  
  constructor() {
    const dbPath = path.join(
      process.env.PROJECT_ROOT!,
      '.memory',
      'database.sqlite'
    );
    
    this.db = new Database(dbPath);
    this.initDatabase();
  }
  
  private initDatabase() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS decisions (...);
      CREATE TABLE IF NOT EXISTS lessons (...);
      CREATE INDEX IF NOT EXISTS idx_lessons_category ON lessons(category);
    `);
  }
  
  async searchMemory(query: string, categories: string[]) {
    // Fast SQL full-text search instead of grepping files
    const stmt = this.db.prepare(`
      SELECT * FROM lessons 
      WHERE category LIKE ? OR title LIKE ? OR fix LIKE ?
      LIMIT 5
    `);
    
    const results = stmt.all(
      `%${query}%`,
      `%${query}%`, 
      `%${query}%`
    );
    
    return results;
  }
}
```

**Benefits**:
- Faster search (indexed)
- Structured queries
- Easy aggregation for analytics
- Backwards compatible (can export to markdown)

---

## Updated Stack Architecture

```
┌─────────────────────────────────────────────────────┐
│         ANTIGRAVITY (The Brain)                     │
│    Claude Opus 4.6 - High-level intent only         │
└────────────────┬────────────────────────────────────┘
                 │
                 │ (Short, compressed requests)
                 │
┌────────────────▼────────────────────────────────────┐
│         MCP SERVERS (The Filter/Manager)            │
│                                                      │
│  • Compress data (Abstract Response Pattern)        │
│  • Manage local state (SQLite)                      │
│  • Strip CLI junk (Output Filtering)                │
│  • Detect loops (Guardrails)                        │
│  • Batch operations (Parallel Execution)            │
│  • Preview changes (Dry Run)                        │
└────────────────┬────────────────────────────────────┘
                 │
                 │ (Efficient, parallel execution)
                 │
┌────────────────▼────────────────────────────────────┐
│         COPILOT CLI (The Muscle)                    │
│    Writes bulk code for flat monthly fee            │
└─────────────────────────────────────────────────────┘
```

---

## Token Economics (Updated with Optimizations)

### Before Optimizations
- Memory reads: 5KB → 2000 tokens per read
- CLI output: 3KB → 1200 tokens per response
- 10 sequential tasks: 10 tool calls
- **Total per complex task**: ~15,000 tokens

### After Optimizations
- Memory reads: `get_context_summary` → 200 tokens (90% ↓)
- CLI output: Abstract responses → 100 tokens (92% ↓)
- 10 parallel tasks: 1 `batch_execute` call → 300 tokens (97% ↓)
- **Total per complex task**: ~1,500 tokens

### Monthly Savings
- **Before**: 1M tokens/month × $0.015 = $15
- **After**: 100K tokens/month × $0.015 = $1.50
- **Additional savings from optimizations**: 50K tokens/month × $0.015 = $0.75
- **New total**: ~$0.75/month
- **Total savings**: 95% cost reduction

---

## Implementation Instructions for Coding Agent

Please create **3 complete, production-ready MCP servers** with:

### Core Requirements (1-8)
1. **Full TypeScript implementation** of all specified tools
2. **Proper MCP protocol** compliance (stdio transport, correct response formats)
3. **Comprehensive error handling** (try-catch, helpful error messages)
4. **Safe file operations** (use fs/promises, mkdir -p, atomic writes)
5. **macOS compatibility** (proper path handling, shell command escaping)
6. **Complete documentation** (README per server, API docs, examples)
7. **Build configuration** (package.json, tsconfig.json)
8. **Installation guide** (SETUP.md with step-by-step instructions)

### Advanced Optimizations (9-12) - CRITICAL FOR PRODUCTION
9. **Abstract Response Pattern** - All tools return summaries, not full content
10. **Output Filtering** - Strip CLI junk from Copilot output
11. **Loop Detection** - Prevent expensive retry cycles (max 3 attempts)
12. **Context Summarization** - `get_context_summary` tool in memory server
13. **Batch Execution** - `copilot_batch_execute` tool for parallel execution
14. **Preview System** - `copilot_preview` tool for dry runs
15. **Smart Prompts** - Inject efficiency rules via MCP prompts capability

### Production-Grade Features (9-12) - MUST HAVE
16. **Budget Enforcement** - `check_budget` tool, hard limits, prevents runaway costs
17. **Git Persistence** - Auto-commit all memory changes, rollback capability, audit trail
18. **Semantic Search** - Vector embeddings with SQLite-VSS, finds meaning not just keywords
19. **Concurrent Locking** - File locks for parallel safety, queue system

### Complete Tool List by Server

**Memory Server** (12 tools total):
- `memory_search(query, categories, top_k)` - Hybrid semantic + keyword search
- `memory_read(file)` - Read specific memory files
- `memory_update(file, operation, content, section)` - Thread-safe updates with locking
- `memory_log_decision(title, what, why, alternatives, impact)` - Structured logging
- `memory_log_lesson(category, type, title, ...)` - Bug/pattern logging
- `memory_snapshot(tag)` - Backup current state
- `get_context_summary(focus_area)` - **NEW**: Compressed state summary
- `memory_history(file, limit)` - **NEW**: Git history
- `memory_rollback(file, commit_hash)` - **NEW**: Time travel
- `memory_diff(file, commit_hash)` - **NEW**: Show changes
- `reindex_memory(force)` - **NEW**: Rebuild semantic index
- `show_locks()` - **NEW**: Show locked files (debugging)

**Copilot Server** (7 tools total):
- `copilot_generate_prompt(intent, file_path, description, ...)` - Uses skills + templates
- `copilot_execute(prompt_file, output_file)` - Run gh CLI, return summary
- `copilot_validate(file_path, requirements)` - Security + quality checks
- `copilot_score(prompt_file, output_file, score, issues)` - Log interaction
- `copilot_batch_execute(tasks[])` - **NEW**: Parallel execution with conflict detection
- `copilot_preview(prompt_file, target_file)` - **NEW**: Dry run with diff
- (Smart Prompts via MCP prompts capability)

**Analytics Server** (5 tools total):
- `log_cost(agent, tokens, task_description)` - Track usage
- `get_cost_summary(period)` - Aggregate costs
- `get_copilot_performance(group_by)` - Success metrics
- `get_insights()` - Pattern analysis
- `check_budget(estimated_tokens, agent)` - **NEW**: Enforce limits

### Critical Implementation Details

**For Memory Server:**
- Use `better-sqlite3` for SQLite backend
- Use `sqlite-vss` for vector search
- Use `@xenova/transformers` for embeddings (Xenova/all-MiniLM-L6-v2 model)
- Implement `FileLockManager` class for concurrent write safety
- Implement `GitPersistence` class for auto-commits
- Implement `SemanticSearch` class for hybrid search

**For Copilot Server:**
- Implement `stripCliJunk()` to clean Copilot output
- Implement `LoopDetector` class to prevent runaway retries
- Return only summaries in Abstract Response Pattern
- Batch executor must detect file conflicts and serialize conflicting tasks
- Preview must generate diffs without writing to disk

**For Analytics Server:**
- Implement `BudgetEnforcer` class with configurable limits
- Load budget from `.memory/config/budget.json`
- Check budget BEFORE expensive operations
- Track daily/weekly/monthly spend separately

**For All Servers:**
- Implement MCP `prompts` capability for efficiency rules
- All responses use Abstract Response Pattern (summaries, not full content)
- Comprehensive error handling with helpful messages
- macOS compatible paths and shell commands

### Dependencies Summary

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^0.5.0",
    "better-sqlite3": "^9.2.0",
    "sqlite-vss": "^0.1.2",
    "@xenova/transformers": "^2.6.0",
    "glob": "^10.3.10"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "@types/better-sqlite3": "^7.6.0",
    "typescript": "^5.3.3"
  }
}
```

### Expected File Structure

```
antigravity-os-mcp/
├── packages/
│   ├── memory-server/
│   │   ├── src/
│   │   │   ├── index.ts              # Main server
│   │   │   ├── semantic-search.ts    # Vector search
│   │   │   ├── git-persistence.ts    # Git integration
│   │   │   └── lock-manager.ts       # File locking
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── README.md
│   ├── copilot-server/
│   │   ├── src/
│   │   │   ├── index.ts              # Main server
│   │   │   ├── loop-detector.ts      # Retry prevention
│   │   │   └── cli-cleaner.ts        # Output filtering
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── README.md
│   └── analytics-server/
│       ├── src/
│       │   ├── index.ts              # Main server
│       │   └── budget-enforcer.ts    # Cost limits
│       ├── package.json
│       ├── tsconfig.json
│       └── README.md
├── README.md                          # Overview, architecture
├── SETUP.md                           # Installation guide
└── package.json                       # Optional: monorepo config
```

### Success Criteria

**Functional:**
- ✅ All 24 tools work correctly
- ✅ Budget enforcement prevents runaway costs
- ✅ Git commits happen automatically on memory changes
- ✅ Semantic search finds relevant content by meaning
- ✅ File locking prevents corruption in parallel execution
- ✅ Abstract Response Pattern saves 80-90% tokens
- ✅ Loop detection stops after 3 failed attempts
- ✅ Batch execution runs non-conflicting tasks in parallel

**Code Quality:**
- ✅ TypeScript types properly defined
- ✅ Comprehensive error handling
- ✅ Well-commented code
- ✅ No hardcoded paths (use environment variables)
- ✅ macOS compatible

**Documentation:**
- ✅ Each server has detailed README
- ✅ SETUP.md with step-by-step installation
- ✅ Tool schemas are clear and complete
- ✅ Examples for common use cases
- ✅ Troubleshooting section

**Performance:**
- ✅ Semantic search <100ms
- ✅ Memory operations thread-safe
- ✅ Git commits don't block operations
- ✅ Budget checks are fast (<10ms)

The deliverable should be a complete, production-ready codebase with all code, configuration, and documentation ready to use, incorporating ALL research-based optimizations and production-grade features.
