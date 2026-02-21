# Antigravity OS v2.1 - Enhanced MCP Server Implementation Context

## Project Overview: AI Development Workflow with Research Integration

### Primary Goal
Build an intelligent "Manager-Worker" architecture optimized for forex algorithmic trading development:
- **Research Phase**: Claude Sonnet 4.6 (claude.ai) - Deep analysis of academic papers and strategies
- **Implementation Phase**: Claude Opus 4.6 in Antigravity IDE - Code generation and orchestration
- **Code Generation**: GitHub Copilot CLI - Tactical implementation
- **Intelligence Layer**: Temporal memory system that learns and evolves

### Current Setup
- **User has**: 4x Antigravity IDE Pro accounts, 1x GitHub Copilot CLI Pro
- **Environment**: macOS
- **User location**: Surabaya, East Java, ID
- **Domain**: Forex algorithmic trading systems

### What's New in v2.1

**Fixes from v2.0:**
- 🔧 **Auto-Executing Copilot** - No more manual terminal commands
- 📏 **Removed Memory Limits** - Full content up to 5000 lines (quality over cost)
- 🔄 **Hybrid Workflow** - Auto-execute with smart confirmations
- 💰 **Higher Budget Defaults** - $5-10/month for quality

**New Research Integration:**
- 📚 **Sonnet Markdown Import** - Upload research from Claude Sonnet sessions
- 🧩 **Intelligent Parsing** - Auto-structure research into categories
- 🔗 **Research Linking** - Connect papers → code → outcomes
- 📊 **Outcome Tracking** - Validate research predictions vs reality

**Enhanced Structure:**
- 📁 **8 Memory Categories** - Organized for complex trading systems
- 🎯 **Research-Based Implementation** - Code with academic context
- ⚡ **Streamlined Tools** - 45 tools total (18+9+14+4 prompts)

---

## 🔄 Actual User Workflow

### Phase 1: Research with Claude Sonnet (claude.ai)
```
User uploads academic papers, market data, backtests
↓
Deep discussion and analysis with Sonnet
↓
Sonnet produces comprehensive markdown analysis
↓
User downloads .md file
```

### Phase 2: Import to Antigravity
```
User uploads Sonnet markdown to Antigravity
↓
Antigravity calls: import_research_analysis()
↓
MCP parses and structures into memory categories
↓
Research indexed and ready for implementation
```

### Phase 3: Implementation
```
User: "Implement the entry strategy from the research"
↓
Antigravity: Reads research, generates prompt with context
↓
Copilot: Generates code automatically
↓
Antigravity: Validates and links to research
↓
User: Reviews and accepts
```

### Phase 4: Validation
```
User: Backtests strategy
↓
User: "Log results: Sharpe 1.6"
↓
Antigravity: Updates research confidence based on outcomes
↓
Temporal memory tracks what actually works
```

---

## 📦 MCP Server Architecture v2.1

### Server 1: Memory Server (20 tools)

**Purpose**: Manage `.memory/` with research integration, temporal tracking, no size limits

#### Original Tools (Enhanced):
1. `memory_search` - Now searches across research, returns full content if <5000 lines
2. `memory_read` - Returns full files (no summaries unless >5000 lines)
3. `memory_update` - Updates with git commit, temporal metadata
4. `memory_log_decision` - Structured decision logging
5. `memory_log_lesson` - Bug/pattern logging with confidence
6. `memory_snapshot` - Backup with confidence data
7. `get_context_summary` - Compressed state with confidence filtering
8. `memory_history` - Git history with confidence evolution
9. `memory_rollback` - Rollback with metadata preservation
10. `memory_diff` - Show changes including confidence
11. `reindex_memory` - Rebuild semantic index, sync temporal data
12. `show_locks` - Active file locks
13. `validate_memory` - Boost confidence on successful use
14. `memory_health_report` - Confidence distribution and alerts
15. `detect_contradictions` - Find conflicting entries
16. `suggest_pruning` - Dry-run archival recommendations
17. `apply_pruning` - Archive low-confidence entries
18. `memory_undo` - Undo recent operations (max 10 steps)

#### New Tools (v2.1):
19. `import_research_analysis` - Import Sonnet markdown, auto-parse sections
20. `get_research_context` - Get research sections for implementation

---

### Server 2: Copilot Server (11 tools + 2 prompts)

**Purpose**: Orchestrate Copilot CLI with automatic execution and research integration

#### Original Tools (Enhanced):
1. `copilot_generate_prompt` - Generate with multi-file context, research injection
2. `copilot_validate` - Validate with research spec checking
3. `copilot_score` - Score with skill effectiveness tracking
4. `copilot_batch_execute` - Batch with conflict detection
5. `copilot_preview` - Preview before execution
6. `copilot_get_context` - Multi-file context gathering
7. `copilot_cache_clear` - Clear response cache
8. `copilot_cache_stats` - Cache statistics

#### New Tools (v2.1):
9. `copilot_execute_and_validate` - AUTO-EXECUTE gh CLI + validate (replaces manual execution)
10. `implement_with_research_context` - Implement with research as context
11. `analyze_failure` - Diagnose failures (read-only)

**Prompts:**
- `efficiency_rules` - Token optimization guidelines
- `quality_standards` - Code quality requirements

---

### Server 3: Analytics Server (14 tools + 2 prompts)

**Purpose**: Cost tracking, performance profiling, research outcome validation

#### Original Tools (Enhanced):
1. `log_cost` - Log with operation timing
2. `get_cost_summary` - Summary with predictions
3. `get_copilot_performance` - Performance with skill correlation
4. `get_insights` - Optimization suggestions
5. `check_budget` - Budget check with rate limiting
6. `get_performance_profile` - Timing with percentiles
7. `system_health` - Component health checks
8. `get_skill_effectiveness` - Skill performance analysis
9. `predict_monthly_cost` - Cost prediction with trends
10. `get_bottlenecks` - Slow operation identification
11. `export_analytics` - Export analytics data
12. `set_rate_limit` - Configure rate limits
13. `get_rate_limit_status` - Rate limit status

#### New Tool (v2.1):
14. `log_research_outcome` - Track research → code → results

**Prompts:**
- `efficiency_rules` - Token optimization (shared)
- `cost_awareness` - Budget and cost guidelines

---

## 🔧 Detailed Tool Specifications (v2.1 Changes)

### Memory Server: `import_research_analysis` (NEW)

```typescript
{
  name: "import_research_analysis",
  description: "Import markdown analysis from Claude Sonnet research session. Intelligently parses sections and structures into memory categories. Handles variable markdown formats.",
  inputSchema: {
    type: "object",
    properties: {
      markdown_content: {
        type: "string",
        description: "Full markdown content from Sonnet (.md file content)"
      },
      title: {
        type: "string",
        description: "Research title (e.g., 'Mean Reversion EUR/USD Analysis')"
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "Tags for categorization (e.g., ['mean-reversion', 'EUR/USD', 'bollinger-bands'])"
      },
      source: {
        type: "string",
        description: "Source reference (e.g., 'Journal of Finance 2024', 'arXiv:2401.xxxxx')"
      }
    },
    required: ["markdown_content", "title"]
  }
}
```

**Implementation Logic:**
```typescript
async importResearchAnalysis(args: any) {
  const { markdown_content, title, tags = [], source } = args;
  
  // Generate research ID
  const researchId = this.generateResearchId(title);
  const researchDir = path.join(
    this.memoryPath,
    'research/analyses',
    researchId
  );
  
  await fs.mkdir(researchDir, { recursive: true });
  
  // Parse markdown into sections
  const sections = this.parseMarkdownSections(markdown_content);
  
  // Common section patterns to detect
  const sectionPatterns = {
    summary: ['executive summary', 'summary', 'overview', 'abstract'],
    findings: ['key findings', 'findings', 'results', 'conclusions'],
    implementation: ['implementation', 'strategy', 'methodology', 'approach'],
    performance: ['performance', 'expected results', 'metrics', 'returns'],
    risks: ['risks', 'limitations', 'considerations', 'warnings']
  };
  
  // Map sections to files
  const structuredSections = {};
  
  for (const [key, patterns] of Object.entries(sectionPatterns)) {
    for (const section of sections) {
      const sectionTitle = section.title.toLowerCase();
      if (patterns.some(p => sectionTitle.includes(p))) {
        structuredSections[key] = section.content;
        await fs.writeFile(
          path.join(researchDir, `${key}.md`),
          section.content
        );
        break;
      }
    }
  }
  
  // Save any unmapped sections
  for (const section of sections) {
    if (!Object.values(structuredSections).includes(section.content)) {
      const filename = this.sanitizeFilename(section.title);
      await fs.writeFile(
        path.join(researchDir, `${filename}.md`),
        section.content
      );
    }
  }
  
  // Create metadata
  const metadata = {
    id: researchId,
    title,
    source: source || 'Unknown',
    tags,
    imported_at: new Date().toISOString(),
    sections: Object.keys(structuredSections),
    confidence: 1.0,
    validation_count: 0,
    outcomes: []
  };
  
  await fs.writeFile(
    path.join(researchDir, 'metadata.json'),
    JSON.stringify(metadata, null, 2)
  );
  
  // Index for search
  await this.indexResearch(researchId, markdown_content, tags);
  
  // Git commit
  await this.gitPersistence.commitChanges(
    researchDir,
    'IMPORT',
    `Imported research: ${title}`
  );
  
  return {
    status: 'success',
    research_id: researchId,
    sections_found: Object.keys(structuredSections),
    location: researchDir,
    summary: `Imported "${title}" with ${Object.keys(structuredSections).length} structured sections`
  };
}

private parseMarkdownSections(markdown: string): Array<{title: string, content: string}> {
  const sections = [];
  const lines = markdown.split('\n');
  let currentSection = null;
  let currentContent = [];
  
  for (const line of lines) {
    // Detect headers (# or ##)
    const headerMatch = line.match(/^#{1,2}\s+(.+)$/);
    
    if (headerMatch) {
      // Save previous section
      if (currentSection) {
        sections.push({
          title: currentSection,
          content: currentContent.join('\n').trim()
        });
      }
      
      // Start new section
      currentSection = headerMatch[1];
      currentContent = [];
    } else if (currentSection) {
      currentContent.push(line);
    }
  }
  
  // Save last section
  if (currentSection) {
    sections.push({
      title: currentSection,
      content: currentContent.join('\n').trim()
    });
  }
  
  return sections;
}
```

---

### Memory Server: `get_research_context` (NEW)

```typescript
{
  name: "get_research_context",
  description: "Get specific research sections for implementation. Returns full content (no summaries) for use in Copilot prompts.",
  inputSchema: {
    type: "object",
    properties: {
      research_id: {
        type: "string",
        description: "Research ID from import_research_analysis"
      },
      sections: {
        type: "array",
        items: { type: "string" },
        description: "Sections to retrieve (e.g., ['implementation', 'findings']). Omit for all."
      },
      specific_topic: {
        type: "string",
        description: "Optional: Extract only content related to specific topic (e.g., 'stop loss')"
      }
    },
    required: ["research_id"]
  }
}
```

**Implementation:**
```typescript
async getResearchContext(args: any) {
  const { research_id, sections, specific_topic } = args;
  
  const researchDir = path.join(
    this.memoryPath,
    'research/analyses',
    research_id
  );
  
  // Read metadata
  const metadata = JSON.parse(
    await fs.readFile(path.join(researchDir, 'metadata.json'), 'utf-8')
  );
  
  // Get requested sections or all
  const sectionsToRead = sections || metadata.sections;
  
  const content = {};
  
  for (const section of sectionsToRead) {
    const sectionPath = path.join(researchDir, `${section}.md`);
    
    try {
      let sectionContent = await fs.readFile(sectionPath, 'utf-8');
      
      // Filter by topic if requested
      if (specific_topic) {
        sectionContent = this.extractRelevantContent(sectionContent, specific_topic);
      }
      
      content[section] = sectionContent;
    } catch {
      // Section doesn't exist, skip
    }
  }
  
  return {
    research_id,
    title: metadata.title,
    source: metadata.source,
    tags: metadata.tags,
    content,
    full_content_length: Object.values(content).join('\n').length
  };
}
```

---

### Copilot Server: `copilot_execute_and_validate` (NEW - CRITICAL)

**Replaces manual execution. This tool ACTUALLY RUNS GitHub Copilot CLI.**

```typescript
{
  name: "copilot_execute_and_validate",
  description: "Execute GitHub Copilot CLI with prompt file, save output, and validate. This tool AUTOMATICALLY runs 'gh copilot suggest' - no manual terminal commands needed. Returns validation results.",
  inputSchema: {
    type: "object",
    properties: {
      prompt_file: {
        type: "string",
        description: "Path to prompt file (from copilot_generate_prompt)"
      },
      output_file: {
        type: "string",
        description: "Where to save generated code"
      },
      requirements: {
        type: "array",
        items: { type: "string" },
        description: "Requirements to validate (e.g., ['Type hints', 'Handle None values'])"
      },
      auto_approve_if_valid: {
        type: "boolean",
        description: "Automatically accept if validation passes (default: false)"
      }
    },
    required: ["prompt_file", "output_file"]
  }
}
```

**Implementation:**
```typescript
async executeAndValidate(args: any) {
  const { prompt_file, output_file, requirements = [], auto_approve_if_valid = false } = args;
  
  // Check budget first
  await this.budgetEnforcer.checkBudget(3000, 'antigravity');
  
  // Check loop detection
  const taskId = `${prompt_file}:${output_file}`;
  this.loopDetector.checkLoop(taskId);
  
  // Check cache
  const cacheKey = await this.cacheManager.getCacheKey(prompt_file);
  const cached = await this.cacheManager.get(cacheKey);
  
  if (cached) {
    await fs.writeFile(output_file, cached.code);
    return {
      status: 'cached',
      file: output_file,
      validation: cached.validation,
      cache_age_hours: this.getCacheAge(cached)
    };
  }
  
  // Read prompt
  const prompt = await fs.readFile(prompt_file, 'utf-8');
  
  // ACTUALLY EXECUTE COPILOT CLI
  console.error('[copilot-server] Executing gh copilot suggest...');
  
  const { stdout, stderr } = await execAsync(
    `gh copilot suggest "${prompt.replace(/"/g, '\\"')}"`,
    {
      maxBuffer: 10 * 1024 * 1024,  // 10MB buffer
      timeout: 60000  // 60 second timeout
    }
  );
  
  if (stderr && stderr.includes('error')) {
    throw new Error(`Copilot CLI error: ${stderr}`);
  }
  
  // Clean output (remove CLI junk)
  const cleanedCode = this.stripCliJunk(stdout);
  
  // Save to file
  await fs.writeFile(output_file, cleanedCode);
  
  console.error(`[copilot-server] Generated ${cleanedCode.split('\n').length} lines`);
  
  // Validate
  const validation = await this.validate({
    file_path: output_file,
    requirements
  });
  
  // Cache if valid
  if (validation.passed) {
    await this.cacheManager.set(cacheKey, {
      code: cleanedCode,
      validation,
      timestamp: Date.now()
    });
    
    // Reset loop detector
    this.loopDetector.reset(taskId);
  }
  
  return {
    status: validation.passed ? 'success' : 'validation_failed',
    file: output_file,
    lines_generated: cleanedCode.split('\n').length,
    validation: {
      passed: validation.passed,
      issues: validation.issues,
      recommendation: validation.passed ? 'APPROVE' : 'REVIEW_REQUIRED'
    },
    preview: cleanedCode.slice(0, 300) + '...',
    auto_approved: auto_approve_if_valid && validation.passed
  };
}

private stripCliJunk(output: string): string {
  // Remove Copilot CLI boilerplate
  let cleaned = output;
  
  const junkPatterns = [
    /^.*Thinking\.\.\./gm,
    /^.*Scanning files\.\.\./gm,
    /^.*GitHub Copilot:/gm,
    /^.*Here is your code:/gm,
    /^```[a-z]*\n?/g,
    /\n?```$/g,
    /^\/\/ Generated by GitHub Copilot.*$/gm
  ];
  
  for (const pattern of junkPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  return cleaned.trim();
}
```

---

### Copilot Server: `implement_with_research_context` (NEW)

```typescript
{
  name: "implement_with_research_context",
  description: "Complete workflow: Load research context → Generate prompt → Execute Copilot → Validate → Link to research. One tool call for research-based implementation.",
  inputSchema: {
    type: "object",
    properties: {
      research_id: {
        type: "string",
        description: "Research ID from import_research_analysis"
      },
      research_section: {
        type: "string",
        description: "Specific section (e.g., 'implementation', 'findings')"
      },
      specific_topic: {
        type: "string",
        description: "Optional: Specific topic from section (e.g., 'entry rules')"
      },
      task_description: {
        type: "string",
        description: "What to implement (e.g., 'Bollinger Band entry signal')"
      },
      file_path: {
        type: "string",
        description: "Output file path"
      },
      function_signature: {
        type: "string",
        description: "Complete function signature with types"
      },
      requirements: {
        type: "array",
        items: { type: "string" },
        description: "Additional requirements"
      }
    },
    required: ["research_id", "task_description", "file_path"]
  }
}
```

**Implementation:**
```typescript
async implementWithResearch(args: any) {
  const steps = [];
  
  // Step 1: Get research context
  const researchContext = await this.memoryServer.getResearchContext({
    research_id: args.research_id,
    sections: args.research_section ? [args.research_section] : undefined,
    specific_topic: args.specific_topic
  });
  
  steps.push({ step: 'research_loaded', sections: Object.keys(researchContext.content) });
  
  // Step 2: Generate prompt with research context
  const promptResult = await this.generatePrompt({
    intent: 'implement_function',
    file_path: args.file_path,
    description: args.task_description,
    function_signature: args.function_signature,
    requirements: args.requirements,
    context: {
      research: researchContext,
      tech_stack: await this.getTechStack(),
      lessons: await this.getLessons()
    }
  });
  
  steps.push({ step: 'prompt_generated', file: promptResult.prompt_file });
  
  // Step 3: Execute and validate
  const executionResult = await this.executeAndValidate({
    prompt_file: promptResult.prompt_file,
    output_file: args.file_path,
    requirements: args.requirements
  });
  
  steps.push({ 
    step: 'executed', 
    status: executionResult.status,
    validation_passed: executionResult.validation.passed 
  });
  
  // Step 4: Link to research (add comment in code)
  if (executionResult.validation.passed) {
    await this.addResearchLink(args.file_path, args.research_id, researchContext.title);
    steps.push({ step: 'linked_to_research' });
  }
  
  return {
    status: executionResult.validation.passed ? 'complete' : 'needs_review',
    file: args.file_path,
    research: {
      id: args.research_id,
      title: researchContext.title,
      source: researchContext.source
    },
    validation: executionResult.validation,
    steps
  };
}

private async addResearchLink(filePath: string, researchId: string, researchTitle: string) {
  const code = await fs.readFile(filePath, 'utf-8');
  
  const header = `# Based on research: .memory/research/analyses/${researchId}/
# Research: "${researchTitle}"
# 
`;
  
  await fs.writeFile(filePath, header + code);
}
```

---

### Analytics Server: `log_research_outcome` (NEW)

```typescript
{
  name: "log_research_outcome",
  description: "Log whether research-based implementation worked in practice. Updates research confidence based on real-world outcomes.",
  inputSchema: {
    type: "object",
    properties: {
      research_id: {
        type: "string",
        description: "Research ID"
      },
      implementation_file: {
        type: "string",
        description: "File that was implemented"
      },
      outcome: {
        type: "string",
        enum: ["success", "partial", "failed"],
        description: "How well research predictions matched reality"
      },
      metrics: {
        type: "object",
        properties: {
          expected_sharpe: { type: "number" },
          actual_sharpe: { type: "number" },
          expected_drawdown: { type: "number" },
          actual_drawdown: { type: "number" },
          notes: { type: "string" }
        }
      }
    },
    required: ["research_id", "implementation_file", "outcome"]
  }
}
```

**Implementation:**
```typescript
async logResearchOutcome(args: any) {
  const { research_id, implementation_file, outcome, metrics = {} } = args;
  
  // Load research metadata
  const metadataPath = path.join(
    this.memoryPath,
    'research/analyses',
    research_id,
    'metadata.json'
  );
  
  const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
  
  // Add outcome
  metadata.outcomes.push({
    file: implementation_file,
    outcome,
    metrics,
    logged_at: new Date().toISOString()
  });
  
  // Update confidence based on outcome
  if (outcome === 'success') {
    metadata.validation_count++;
    // Boost confidence
  } else if (outcome === 'failed') {
    metadata.contradiction_count++;
    // Reduce confidence
  }
  
  // Recalculate confidence
  metadata.confidence = this.calculateResearchConfidence(metadata);
  
  // Save
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  
  // Log to analytics
  const logEntry = {
    timestamp: new Date().toISOString(),
    research_id,
    outcome,
    metrics,
    confidence_after: metadata.confidence
  };
  
  await this.appendToLog('research_outcomes.jsonl', logEntry);
  
  return {
    research_id,
    new_confidence: metadata.confidence,
    total_outcomes: metadata.outcomes.length,
    success_rate: metadata.outcomes.filter(o => o.outcome === 'success').length / metadata.outcomes.length
  };
}
```

---

## 📁 Enhanced Memory Structure (v2.1)

```
.memory/
├── core/
│   ├── tech_stack.md
│   ├── project_overview.md
│   └── trading_principles.md           # Immutable core rules
│
├── research/                             # ← NEW CATEGORY
│   ├── analyses/                         # Structured Sonnet outputs
│   │   ├── 2024-02-mean-reversion-bb/
│   │   │   ├── metadata.json            # Research metadata
│   │   │   ├── summary.md               # Executive summary
│   │   │   ├── findings.md              # Key findings
│   │   │   ├── implementation.md        # Implementation details
│   │   │   ├── performance.md           # Expected metrics
│   │   │   └── risks.md                 # Risks and limitations
│   │   └── 2024-01-ml-forex/
│   │       └── ...
│   └── outcomes/                         # Real-world results
│       └── research_results.md          # Performance tracking
│
├── strategies/
│   ├── trend_following/
│   │   ├── macd_crossover.md
│   │   ├── adr_breakout.md
│   │   └── SOURCES.md                   # Links to research
│   ├── mean_reversion/
│   │   ├── bollinger_bands.md
│   │   └── rsi_divergence.md
│   └── machine_learning/
│       └── lstm_prediction.md
│
├── indicators/
│   ├── momentum/
│   │   ├── macd.md
│   │   ├── rsi.md
│   │   └── stochastic.md
│   ├── volatility/
│   │   ├── atr.md
│   │   └── bollinger_bands.md
│   └── custom/
│       └── adaptive_indicators.md
│
├── backtests/
│   ├── 2024/
│   │   ├── q1_results.md
│   │   └── parameter_optimization.md
│   ├── by_strategy/
│   │   ├── trend_following_results.md
│   │   └── mean_reversion_results.md
│   └── research_validation/              # Test research predictions
│       └── 2024-02-bb-validation.md
│
├── risk_management/
│   ├── position_sizing.md
│   ├── stop_loss_strategies.md
│   ├── portfolio_rules.md
│   └── drawdown_management.md
│
├── decisions/
│   ├── ACTIVE.md
│   └── archive/
│       └── 2024-01/
│
├── lessons/
│   ├── best_practices.md
│   ├── bugs_fixed.md
│   └── anti_patterns.md
│
├── config/
│   ├── budget.json
│   └── temporal.json
│
├── snapshots/
│   ├── costs.jsonl
│   ├── scores.jsonl
│   └── research_outcomes.jsonl
│
└── antigravity.db                       # SQLite database
```

---

## 🔄 Complete Workflow Examples

### Example 1: Research Import → Implementation

```
# Phase 1: Research with Sonnet
[User in claude.ai with Sonnet]
User: [Uploads 3 papers on mean reversion]
Sonnet: [Deep analysis, produces comprehensive markdown]
User: [Downloads mean-reversion-analysis-feb2024.md]

# Phase 2: Import to Antigravity
[User in Antigravity with Opus]
User: [Uploads mean-reversion-analysis-feb2024.md]
      "Import this research analysis"

Antigravity calls:
import_research_analysis({
  markdown_content: [file content],
  title: "Mean Reversion EUR/USD with Bollinger Bands",
  tags: ["mean-reversion", "bollinger-bands", "EUR/USD"],
  source: "Multiple academic papers, see markdown"
})

Response:
{
  status: 'success',
  research_id: '2024-02-mean-reversion-bb',
  sections_found: ['summary', 'findings', 'implementation', 'performance', 'risks'],
  location: '.memory/research/analyses/2024-02-mean-reversion-bb/',
  summary: 'Imported "Mean Reversion EUR/USD with Bollinger Bands" with 5 structured sections'
}

Antigravity: "Research imported successfully. Found:
- 3 key findings
- Entry/exit strategy details
- Expected Sharpe: 1.8
- Risk considerations
Ready to discuss implementation."

# Phase 3: Discussion
User: "What's the main finding about standard deviation?"

Antigravity: 
[Reads .memory/research/analyses/2024-02-mean-reversion-bb/findings.md]
"The research shows 2.5 std dev Bollinger Bands reduce false signals by 40% 
compared to standard 2.0. This is particularly effective on H4 timeframe for EUR/USD."

User: "Good. Let's implement the entry signal detection."

# Phase 4: Implementation
Antigravity calls:
implement_with_research_context({
  research_id: '2024-02-mean-reversion-bb',
  research_section: 'implementation',
  specific_topic: 'entry rules',
  task_description: 'Bollinger Band mean reversion entry signal',
  file_path: 'strategies/mean_reversion/bb_entry.py',
  function_signature: 'def detect_entry_signal(df: pd.DataFrame, bb_std: float = 2.5) -> pd.Series:',
  requirements: [
    'Use 2.5 std dev per research',
    'RSI confirmation < 30',
    'H4 timeframe optimized',
    'Type hints required'
  ]
})

Internally:
1. Loads research implementation section
2. Extracts entry rules
3. Generates prompt with research context
4. Calls copilot_generate_prompt()
5. Calls copilot_execute_and_validate()
   → Runs: gh copilot suggest "[prompt]"
   → Saves code to bb_entry.py
   → Validates (checks 2.5 std dev used, RSI < 30, etc.)
6. Adds research link comment to code
7. Returns result

Response:
{
  status: 'complete',
  file: 'strategies/mean_reversion/bb_entry.py',
  research: {
    id: '2024-02-mean-reversion-bb',
    title: 'Mean Reversion EUR/USD with Bollinger Bands',
    source: 'Multiple academic papers, see markdown'
  },
  validation: {
    passed: true,
    issues: [],
    recommendation: 'APPROVE'
  }
}

Antigravity: "Entry signal implemented successfully.
- Uses 2.5 std dev as specified in research
- RSI < 30 confirmation included
- Optimized for H4 timeframe
- 87 lines generated
- All validations passed

File: strategies/mean_reversion/bb_entry.py

Code includes reference to research source. Ready for backtesting."

# Phase 5: Validation
[User backtests the strategy]

User: "Backtest complete. Sharpe ratio: 1.6
      Expected was 1.8, but close. Good results overall."

Antigravity calls:
log_research_outcome({
  research_id: '2024-02-mean-reversion-bb',
  implementation_file: 'strategies/mean_reversion/bb_entry.py',
  outcome: 'success',
  metrics: {
    expected_sharpe: 1.8,
    actual_sharpe: 1.6,
    notes: 'Slight difference likely due to transaction costs in our model. Research validated.'
  }
})

Response:
{
  research_id: '2024-02-mean-reversion-bb',
  new_confidence: 1.0,  // Stays high, validated
  total_outcomes: 1,
  success_rate: 1.0
}

Antigravity: "Research outcome logged. 
Confidence: 1.0 (validated in practice)
This research can be trusted for future implementations."
```

---

### Example 2: Multi-Account Usage

```
Account #1 (Morning):
- Import 2 research papers
- Implement 3 indicators
- Backtest strategy
[Hits quota after 2 hours]

Account #2 (Afternoon):
- Open new Antigravity window
- Same MCP servers (all context preserved!)
- Continue where Account #1 left off
- Implement exit strategy
- Optimize parameters
[Continue working...]

All accounts share:
- Same .memory/ directory
- Same research analyses
- Same temporal confidence scores
- Same skills and lessons
- Seamless handoff
```

---

## ⚙️ Configuration Changes

### Budget Configuration (v2.1)

**File**: `.memory/config/budget.json`

```json
{
  "daily_limit_usd": 5.00,      // Increased from 2.00
  "weekly_limit_usd": 25.00,     // Increased from 10.00
  "monthly_limit_usd": 100.00,   // Increased from 30.00
  "alert_threshold": 0.80,
  "costs": {
    "antigravity_input": 0.015,
    "antigravity_output": 0.075,
    "copilot": 0.0
  },
  "rate_limits": {
    "memory_update": {
      "per_minute": 20,            // Increased from 10
      "per_hour": 200              // Increased from 100
    },
    "copilot_execute_and_validate": {
      "per_minute": 10,            // Increased from 5
      "per_hour": 100              // Increased from 50
    },
    "import_research_analysis": {
      "per_hour": 20,
      "per_day": 100
    }
  },
  "emergency_override": false
}
```

**Rationale**: Quality over cost for complex trading systems.

---

## 🎯 Memory Size Policy (v2.1)

### No More Artificial Limits

```typescript
// OLD (v2.0):
if (content.length > 300) {
  return summarize(content);  // Lossy compression
}

// NEW (v2.1):
if (content.length < 5000) {
  return content;  // Full content
} else {
  return {
    content_chunks: chunkContent(content, 5000),
    total_chunks: Math.ceil(content.length / 5000),
    note: "Content split into chunks. Use memory_read with chunk parameter."
  };
}
```

### Return Policy by File Size:

| File Size | v2.0 Behavior | v2.1 Behavior |
|-----------|---------------|---------------|
| < 100 lines | Full content | Full content ✓ |
| 100-300 lines | Summary | Full content ✓ |
| 300-1000 lines | Summary | Full content ✓ |
| 1000-5000 lines | Summary | Full content ✓ |
| 5000+ lines | Error/truncate | Chunked content ✓ |

**Philosophy**: Trading systems are complex. Full context is worth the tokens.

---

## 🔧 Implementation Instructions for Coding Agent

### Critical v2.1 Changes to Implement:

1. **Copilot Auto-Execution** (HIGHEST PRIORITY)
   - `copilot_execute_and_validate` tool MUST actually run `gh copilot suggest`
   - Use `child_process.execAsync` to execute CLI
   - Strip CLI junk from output before saving
   - Return validation results, not full code (Abstract Response Pattern still applies to responses)

2. **Research Import System**
   - `import_research_analysis` must parse variable markdown formats
   - Detect common section patterns intelligently
   - Create structured directory per research
   - Generate metadata.json with temporal fields

3. **Memory Size Limits Removed**
   - Change threshold from 300 chars to 5000 lines
   - Return full content unless >5000 lines
   - Implement chunking for very large files
   - Update all tools: memory_read, memory_search, get_context_summary

4. **Research-Based Implementation**
   - `implement_with_research_context` workflow tool
   - Inject research sections into Copilot prompts
   - Add research reference comments to generated code
   - Link implementations to source research

5. **Outcome Tracking**
   - `log_research_outcome` updates research confidence
   - Track expected vs actual metrics
   - Temporal confidence for research (like memory entries)

6. **Budget Adjustments**
   - Increase default limits ($5-10/month range)
   - Adjust rate limits for higher throughput
   - Keep emergency override option

### File Modifications Required:

**packages/memory-server/src/index.ts**:
- Add `import_research_analysis` tool handler
- Add `get_research_context` tool handler
- Update `memory_read` to return full content <5000 lines
- Update `memory_search` to return full results
- Add research directory initialization

**packages/copilot-server/src/index.ts**:
- Rename `copilot_execute` to `copilot_generate_prompt` (just creates prompt)
- Add NEW `copilot_execute_and_validate` (runs gh CLI)
- Add `implement_with_research_context` workflow tool
- Implement CLI execution with `execAsync`
- Add `stripCliJunk` function

**packages/analytics-server/src/index.ts**:
- Add `log_research_outcome` tool handler
- Update budget defaults
- Add research outcome logging

**New Module: packages/memory-server/src/research-importer.ts**:
- Markdown section parser
- Intelligent section detection
- Research directory structuring
- Metadata generation

### Expected Deliverable Structure:

```
antigravity-os-mcp/
├── packages/
│   ├── memory-server/
│   │   ├── src/
│   │   │   ├── index.ts                  # Enhanced with research tools
│   │   │   ├── research-importer.ts      # NEW: Markdown parsing
│   │   │   ├── temporal.ts               # Research confidence tracking
│   │   │   └── ...
│   ├── copilot-server/
│   │   ├── src/
│   │   │   ├── index.ts                  # Auto-execution logic
│   │   │   ├── cli-executor.ts           # NEW: gh CLI wrapper
│   │   │   ├── research-integration.ts   # NEW: Research context injection
│   │   │   └── ...
│   └── analytics-server/
│       ├── src/
│       │   ├── index.ts                  # Research outcome tracking
│       │   └── ...
├── examples/
│   ├── research-import-example.md        # Sample Sonnet markdown
│   └── ...
└── MIGRATION-v2.0-to-v2.1.md            # Upgrade guide
```

---

## ✅ Success Criteria

### Functional Requirements:
- ✅ `copilot_execute_and_validate` runs `gh copilot suggest` automatically
- ✅ Copilot output is cleaned (CLI junk removed)
- ✅ Research markdown is parsed into structured sections
- ✅ Memory returns full content for files <5000 lines
- ✅ Research context is injected into Copilot prompts
- ✅ Generated code includes research reference comments
- ✅ Research outcomes update confidence scores
- ✅ All 4 Antigravity accounts can use same MCP servers
- ✅ Budget defaults reflect $5-10/month target

### Performance Requirements:
- ✅ Memory operations: <100ms
- ✅ Research import: <2 seconds
- ✅ Copilot execution: <60 seconds (CLI dependent)
- ✅ Full workflow (research → code): <90 seconds

### Quality Requirements:
- ✅ No data loss when switching accounts
- ✅ Research structure handles variable markdown formats
- ✅ Validation catches research spec violations
- ✅ Temporal confidence works for research entries
- ✅ Git commits every change with proper messages

---

## 🎯 Testing Instructions

### Test 1: Auto-Execute Copilot
```bash
# Create test prompt
echo "def hello(): pass" > /tmp/test_prompt.txt

# Test new tool
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"copilot_execute_and_validate","arguments":{"prompt_file":"/tmp/test_prompt.txt","output_file":"/tmp/test_output.py"}},"id":3}' | PROJECT_ROOT=/tmp node packages/copilot-server/build/index.js

# Should:
# 1. Run gh copilot suggest
# 2. Save to /tmp/test_output.py
# 3. Return validation results
```

### Test 2: Research Import
```bash
# Create test markdown
cat > /tmp/test_research.md << 'EOF'
# Test Research

## Key Findings
- Finding 1
- Finding 2

## Implementation
Strategy details here.
EOF

# Test import
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"import_research_analysis","arguments":{"markdown_content":"...","title":"Test Research"}},"id":3}' | PROJECT_ROOT=/tmp node packages/memory-server/build/index.js

# Should create:
# /tmp/.memory/research/analyses/test-research/
# ├── metadata.json
# ├── findings.md
# └── implementation.md
```

### Test 3: Memory Size
```bash
# Create large file
seq 1 1000 > /tmp/.memory/test_large.md

# Test read
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"memory_read","arguments":{"file":"test_large"}},"id":3}' | PROJECT_ROOT=/tmp node packages/memory-server/build/index.js

# Should return full content (1000 lines < 5000 threshold)
```

---

## 📝 Migration from v2.0 to v2.1

### Backward Compatibility:
- ✅ All v2.0 tools continue to work
- ✅ Existing memory files are compatible
- ✅ Temporal metadata is preserved
- ✅ Git history is maintained
- ✅ No breaking changes to existing workflows

### New Features Are Additive:
- Old: `copilot_execute` → Still works (renamed to `copilot_generate_prompt`)
- New: `copilot_execute_and_validate` → Runs CLI automatically
- Users can adopt new workflow gradually

### Optional Migration:
1. Update budget config to new defaults (optional)
2. Reorganize memory into 8 categories (optional)
3. Import existing research notes (optional)
4. Start using auto-execution (recommended)

---

## 🚀 Final Notes

### v2.1 Solves:
1. ✅ Manual Copilot execution (now automatic)
2. ✅ Memory size limits (now 5000 lines)
3. ✅ Research integration (Sonnet → Antigravity workflow)
4. ✅ Token budget misalignment (now $5-10/month)
5. ✅ Complex trading system organization (8 categories)

### v2.1 Enables:
1. ✅ Seamless multi-account usage (4 Antigravity accounts)
2. ✅ Research-driven development (papers → code → validation)
3. ✅ Full context for complex systems (no artificial limits)
4. ✅ One-command workflows (research → implementation)
5. ✅ Academic → Production pipeline

### Philosophy:
**Quality over Cost** - For complex forex trading systems, full context and accurate implementation are worth the token cost. The system prioritizes correctness and completeness over aggressive optimization.

---

**This is the complete specification for Antigravity OS v2.1 - Enhanced for Research Integration and Auto-Execution.** 🚀
