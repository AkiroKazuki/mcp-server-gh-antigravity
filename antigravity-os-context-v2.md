# Antigravity OS v2.0 - Complete MCP Server Implementation Context

## Project Overview: Next-Generation AI Development Workflow

### Primary Goal
Build an intelligent "Manager-Worker" architecture that learns and improves over time:
- **Manager**: Claude Opus 4.6 in Antigravity IDE (strategic planning, decisions, verification)
- **Worker**: GitHub Copilot CLI (tactical code generation)
- **Intelligence**: Temporal memory system that evolves with your codebase

### Current Setup
- **User has**: Antigravity IDE (Pro plan), GitHub Copilot CLI (Pro plan)
- **Environment**: macOS

### What's New in v2.0
- 🧠 **Temporal Memory** - Confidence scoring with time decay (NEVER BEEN BUILT BEFORE)
- 🔍 **Enhanced Context** - Multi-file awareness for Copilot
- 💾 **Response Caching** - Reuse successful outputs
- 📊 **Intelligence Layer** - Failure analysis, skill effectiveness tracking
- 🛡️ **Safety Features** - Undo/redo, sandbox mode, approval queues
- 📈 **Performance** - Profiling, health checks, compression

---

## 🌟 Revolutionary Feature: Temporal Memory with Confidence Decay

### The Problem
Traditional AI assistants treat all memory as equally valid forever. But:
- Code patterns evolve
- Old decisions become obsolete  
- What worked 6 months ago might not work now
- Contradictory information accumulates

### The Solution
Memory that **self-adapts over time** through confidence scoring.

### How It Works

#### 1. Every Memory Entry Has Metadata
```typescript
interface MemoryEntry {
  id: string;
  content: string;
  file: string;
  category: 'decision' | 'lesson' | 'pattern' | 'core';
  
  // Temporal metadata
  created_at: string;           // ISO timestamp
  confidence: number;           // 0.0 to 1.0
  last_validated: string;       // ISO timestamp
  validation_count: number;     // How many times successfully used
  contradiction_count: number;  // Times contradicted
  
  // Optional
  tags?: string[];
  related_entries?: string[];   // IDs of related entries
}
```

#### 2. Confidence Calculation Algorithm
```typescript
function calculateConfidence(entry: MemoryEntry): number {
  const now = Date.now();
  const daysSinceCreation = (now - new Date(entry.created_at).getTime()) / (1000 * 60 * 60 * 24);
  const daysSinceValidation = (now - new Date(entry.last_validated).getTime()) / (1000 * 60 * 60 * 24);
  
  let confidence = entry.confidence;
  
  // Time decay: -0.5% per day without validation (max 50% loss in 100 days)
  const decayRate = 0.005;
  const maxDecay = 0.5;
  const timeDecay = Math.min(daysSinceValidation * decayRate, maxDecay);
  confidence -= timeDecay;
  
  // Validation boost: +0.03 per successful use (max +0.3 from validations)
  const validationBoost = Math.min(entry.validation_count * 0.03, 0.3);
  confidence += validationBoost;
  
  // Contradiction penalty: -0.15 per contradiction
  const contradictionPenalty = entry.contradiction_count * 0.15;
  confidence -= contradictionPenalty;
  
  // Age penalty for core principles (shouldn't apply to immutable facts)
  if (entry.category !== 'core') {
    const ageInYears = daysSinceCreation / 365;
    const agePenalty = Math.min(ageInYears * 0.1, 0.3);
    confidence -= agePenalty;
  }
  
  // Clamp between 0 and 1
  return Math.max(0, Math.min(1, confidence));
}
```

#### 3. Confidence Status Categories
```typescript
enum ConfidenceStatus {
  HIGH = 'high',           // 0.7 - 1.0: Highly reliable
  MEDIUM = 'medium',       // 0.4 - 0.7: Review recommended
  LOW = 'low',             // 0.2 - 0.4: Likely outdated
  OBSOLETE = 'obsolete'    // 0.0 - 0.2: Should be archived
}

function getConfidenceStatus(confidence: number): ConfidenceStatus {
  if (confidence >= 0.7) return ConfidenceStatus.HIGH;
  if (confidence >= 0.4) return ConfidenceStatus.MEDIUM;
  if (confidence >= 0.2) return ConfidenceStatus.LOW;
  return ConfidenceStatus.OBSOLETE;
}
```

#### 4. Contradiction Detection
```typescript
interface Contradiction {
  entry1_id: string;
  entry2_id: string;
  similarity_score: number;    // 0.0 to 1.0 from semantic search
  conflict_type: 'direct' | 'partial' | 'context';
  entry1_confidence: number;
  entry2_confidence: number;
  recommendation: string;
}

// Example:
{
  entry1: "Use Redis for caching",
  entry2: "Use PostgreSQL for caching",
  similarity_score: 0.85,
  conflict_type: 'direct',
  entry1_confidence: 0.3,
  entry2_confidence: 0.9,
  recommendation: "Archive entry1 (lower confidence)"
}
```

---

## 📦 MCP Server Architecture v2.0

### Server 1: Memory Server (Enhanced)
**Total Tools: 18** (was 12 in v1)

#### Original Tools (Enhanced):
1. `memory_search` - Now includes confidence ranking
2. `memory_read` - Now shows confidence scores
3. `memory_update` - Now updates temporal metadata
4. `memory_log_decision` - Now includes confidence tracking
5. `memory_log_lesson` - Now includes validation tracking
6. `memory_snapshot` - Now includes confidence data
7. `get_context_summary` - Now filters by confidence
8. `memory_history` - Now shows confidence evolution
9. `memory_rollback` - Preserves confidence metadata
10. `memory_diff` - Shows confidence changes
11. `reindex_memory` - Now rebuilds confidence index
12. `show_locks` - Same as v1

#### New Tools (v2):
13. `validate_memory` - Mark memory as still valid (boosts confidence)
14. `memory_health_report` - Show confidence distribution
15. `detect_contradictions` - Find conflicting memories
16. `suggest_pruning` - Recommend archival (dry-run mode)
17. `apply_pruning` - Archive low-confidence entries
18. `memory_undo` - Undo last operation

---

### Server 2: Copilot Server (Enhanced)
**Total Tools: 11** (was 6 in v1) + **2 Prompts**

#### Original Tools (Enhanced):
1. `copilot_generate_prompt` - Now includes multi-file context
2. `copilot_execute` - Now with response caching
3. `copilot_validate` - Enhanced security patterns
4. `copilot_score` - Now feeds skill effectiveness tracking
5. `copilot_batch_execute` - Improved conflict detection
6. `copilot_preview` - Enhanced diff display

#### New Tools (v2):
7. `copilot_get_context` - Gather multi-file context
8. `copilot_cache_clear` - Clear response cache
9. `copilot_cache_stats` - Cache hit/miss statistics
10. `analyze_failure` - Analyze why Copilot failed (read-only)
11. `suggest_skill_update` - Propose skill improvements (approval required)

#### Prompts:
- `efficiency_rules` - Token optimization guidelines
- `quality_standards` - Code quality requirements

---

### Server 3: Analytics Server (Enhanced)
**Total Tools: 13** (was 5 in v1) + **1 Prompt**

#### Original Tools (Enhanced):
1. `log_cost` - Now includes operation timing
2. `get_cost_summary` - Enhanced with predictions
3. `get_copilot_performance` - Now includes skill correlation
4. `get_insights` - AI-generated optimization suggestions
5. `check_budget` - Enhanced with rate limiting

#### New Tools (v2):
6. `get_performance_profile` - Detailed operation timing
7. `system_health` - Overall health check
8. `get_skill_effectiveness` - Track which skills help most
9. `predict_monthly_cost` - ML-based cost prediction
10. `get_bottlenecks` - Identify slow operations
11. `export_analytics` - Export data for external analysis
12. `set_rate_limit` - Configure operation rate limits
13. `get_rate_limit_status` - Check current rate limit usage

#### Prompt:
- `cost_awareness` - Budget and efficiency reminders

---

## 🔧 Detailed Tool Specifications

### Memory Server v2.0

#### Tool 1: `memory_search` (Enhanced)
```typescript
{
  name: "memory_search",
  description: "Search memory with confidence-based ranking. Returns high-confidence results first.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query"
      },
      categories: {
        type: "array",
        items: { type: "string" },
        description: "Filter by category"
      },
      top_k: {
        type: "number",
        description: "Number of results (default: 5)"
      },
      min_confidence: {
        type: "number",
        description: "Minimum confidence threshold (default: 0.0, range: 0.0-1.0)"
      },
      include_metadata: {
        type: "boolean",
        description: "Include confidence scores and timestamps (default: true)"
      }
    },
    required: ["query"]
  }
}

// Response format:
{
  method: "semantic" | "keyword",
  results: [
    {
      content: string,
      file: string,
      category: string,
      confidence: number,
      confidence_status: "high" | "medium" | "low" | "obsolete",
      last_validated: string,
      validation_count: number,
      age_days: number,
      relevance_score: number
    }
  ],
  warnings: [
    "2 results have low confidence and may be outdated"
  ]
}
```

#### Tool 13: `validate_memory` (NEW)
```typescript
{
  name: "validate_memory",
  description: "Mark a memory entry as still valid. Boosts confidence and updates last_validated timestamp. Use when successfully applying a pattern.",
  inputSchema: {
    type: "object",
    properties: {
      entry_id: {
        type: "string",
        description: "Memory entry ID from search results"
      },
      validation_notes: {
        type: "string",
        description: "Optional: Why this is still valid"
      },
      context: {
        type: "string",
        description: "Optional: Where/how it was used successfully"
      }
    },
    required: ["entry_id"]
  }
}

// Implementation:
async validateMemory(entryId: string, notes?: string) {
  const entry = await this.getEntry(entryId);
  
  // Boost confidence
  entry.validation_count++;
  entry.last_validated = new Date().toISOString();
  entry.confidence = this.calculateConfidence(entry);
  
  // Log validation
  if (notes) {
    entry.validation_history = entry.validation_history || [];
    entry.validation_history.push({
      timestamp: new Date().toISOString(),
      notes
    });
  }
  
  await this.saveEntry(entry);
  
  return {
    entry_id: entryId,
    new_confidence: entry.confidence,
    confidence_status: this.getConfidenceStatus(entry.confidence),
    validation_count: entry.validation_count
  };
}
```

#### Tool 14: `memory_health_report` (NEW)
```typescript
{
  name: "memory_health_report",
  description: "Get overview of memory health: confidence distribution, outdated entries, contradictions.",
  inputSchema: {
    type: "object",
    properties: {
      include_recommendations: {
        type: "boolean",
        description: "Include actionable recommendations (default: true)"
      }
    }
  }
}

// Response format:
{
  summary: {
    total_entries: number,
    by_confidence: {
      high: number,      // 0.7-1.0
      medium: number,    // 0.4-0.7
      low: number,       // 0.2-0.4
      obsolete: number   // 0.0-0.2
    },
    avg_confidence: number,
    avg_age_days: number
  },
  alerts: [
    "15 entries have confidence < 0.4 and should be reviewed",
    "3 contradictions detected",
    "5 entries not validated in 90+ days"
  ],
  recommendations: [
    {
      action: "review",
      entries: ["entry_id_1", "entry_id_2"],
      reason: "Low confidence, likely outdated"
    },
    {
      action: "resolve_contradiction",
      entries: ["entry_id_3", "entry_id_4"],
      reason: "Conflicting information about database choice"
    }
  ],
  health_score: number  // 0-100
}
```

#### Tool 15: `detect_contradictions` (NEW)
```typescript
{
  name: "detect_contradictions",
  description: "Find contradictory memories using semantic similarity. Returns pairs of conflicting entries with resolution recommendations.",
  inputSchema: {
    type: "object",
    properties: {
      category: {
        type: "string",
        description: "Optional: Only check specific category"
      },
      similarity_threshold: {
        type: "number",
        description: "Semantic similarity threshold for contradiction (default: 0.7)"
      }
    }
  }
}

// Implementation:
async detectContradictions(category?: string, threshold = 0.7) {
  // Get all entries
  const entries = await this.getAllEntries(category);
  const contradictions: Contradiction[] = [];
  
  // Compare each pair using semantic search
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const similarity = await this.semanticSimilarity(
        entries[i].content,
        entries[j].content
      );
      
      if (similarity >= threshold) {
        // High similarity but check if they conflict
        const isContradiction = await this.checkIfConflicting(
          entries[i],
          entries[j]
        );
        
        if (isContradiction) {
          contradictions.push({
            entry1: entries[i],
            entry2: entries[j],
            similarity_score: similarity,
            conflict_type: this.classifyConflict(entries[i], entries[j]),
            recommendation: this.getResolutionRecommendation(entries[i], entries[j])
          });
        }
      }
    }
  }
  
  return { contradictions, count: contradictions.length };
}

// Conflict detection logic:
checkIfConflicting(entry1, entry2): boolean {
  // Check for opposite keywords
  const opposites = [
    ['use', 'avoid'],
    ['recommended', 'deprecated'],
    ['prefer', 'discourage'],
    ['yes', 'no'],
    ['enable', 'disable']
  ];
  
  // Check for different choices for same thing
  // e.g., "Use Redis" vs "Use PostgreSQL" for same purpose
  
  // Use LLM or heuristics
  return /* contradiction detected */;
}
```

#### Tool 16: `suggest_pruning` (NEW)
```typescript
{
  name: "suggest_pruning",
  description: "Suggest which memories to archive based on low confidence. Dry-run mode shows what would be removed without actually doing it.",
  inputSchema: {
    type: "object",
    properties: {
      confidence_threshold: {
        type: "number",
        description: "Archive entries below this confidence (default: 0.2)"
      },
      age_threshold_days: {
        type: "number",
        description: "Also consider age (default: 180 days)"
      },
      dry_run: {
        type: "boolean",
        description: "Preview only, don't actually archive (default: true)"
      }
    }
  }
}

// Response format:
{
  candidates_for_archival: [
    {
      entry_id: string,
      content_preview: string,  // First 100 chars
      confidence: number,
      age_days: number,
      last_validated: string,
      reason: "Confidence 0.15, not validated in 245 days"
    }
  ],
  total_candidates: number,
  estimated_space_savings: string,  // e.g., "45KB"
  dry_run: boolean
}
```

#### Tool 17: `apply_pruning` (NEW)
```typescript
{
  name: "apply_pruning",
  description: "Archive low-confidence entries. Moves them to archive/ directory but doesn't delete. Requires explicit confirmation.",
  inputSchema: {
    type: "object",
    properties: {
      entry_ids: {
        type: "array",
        items: { type: "string" },
        description: "Specific entries to archive"
      },
      confirm: {
        type: "boolean",
        description: "Must be true to proceed"
      }
    },
    required: ["entry_ids", "confirm"]
  }
}

// Safety: Creates git commit before archival
// Archives to: .memory/archive/YYYY-MM/entry_id.md
// Keeps metadata in archive index for potential restoration
```

#### Tool 18: `memory_undo` (NEW)
```typescript
{
  name: "memory_undo",
  description: "Undo the last memory operation. Safe way to reverse mistakes. Can undo multiple operations.",
  inputSchema: {
    type: "object",
    properties: {
      steps: {
        type: "number",
        description: "Number of operations to undo (default: 1, max: 10)"
      }
    }
  }
}

// Implementation uses git internally:
async undoOperation(steps = 1) {
  const operations = await this.getRecentOperations(steps);
  
  for (const op of operations.reverse()) {
    await this.gitPersistence.rollback(op.commit_hash);
  }
  
  return {
    undone: operations.map(op => ({
      operation: op.type,
      file: op.file,
      timestamp: op.timestamp
    })),
    current_state: await this.getCurrentState()
  };
}
```

---

### Copilot Server v2.0

#### Tool 7: `copilot_get_context` (NEW)
```typescript
{
  name: "copilot_get_context",
  description: "Gather multi-file context for a Copilot prompt. Includes related files, imports, base classes, recent changes.",
  inputSchema: {
    type: "object",
    properties: {
      target_file: {
        type: "string",
        description: "File that will be created/modified"
      },
      include_imports: {
        type: "boolean",
        description: "Include imported files (default: true)"
      },
      include_recent_changes: {
        type: "boolean",
        description: "Include git diff of related files (default: true)"
      },
      max_context_size: {
        type: "number",
        description: "Max chars of context (default: 5000)"
      }
    },
    required: ["target_file"]
  }
}

// Implementation:
async getContext(targetFile: string): Promise<string> {
  const context: string[] = [];
  
  // 1. Find imports/dependencies
  const imports = await this.extractImports(targetFile);
  for (const imp of imports) {
    const importedFile = await this.resolveImport(imp);
    if (importedFile) {
      const signature = await this.extractSignatures(importedFile);
      context.push(`// From ${imp}:\n${signature}`);
    }
  }
  
  // 2. Find base classes if extending
  const baseClasses = await this.findBaseClasses(targetFile);
  for (const base of baseClasses) {
    context.push(`// Base class:\n${base}`);
  }
  
  // 3. Recent changes in related files
  const recentChanges = await this.getRecentRelatedChanges(targetFile);
  if (recentChanges) {
    context.push(`// Recent changes:\n${recentChanges}`);
  }
  
  // 4. Type definitions
  const types = await this.extractTypeDefinitions(targetFile);
  context.push(`// Type definitions:\n${types}`);
  
  // Combine and truncate
  return context.join('\n\n').slice(0, maxContextSize);
}
```

#### Tool 8: `copilot_cache_clear` (NEW)
```typescript
{
  name: "copilot_cache_clear",
  description: "Clear Copilot response cache. Use when you want fresh responses instead of cached ones.",
  inputSchema: {
    type: "object",
    properties: {
      scope: {
        type: "string",
        enum: ["all", "project", "today"],
        description: "What to clear (default: 'project')"
      }
    }
  }
}
```

#### Tool 9: `copilot_cache_stats` (NEW)
```typescript
{
  name: "copilot_cache_stats",
  description: "Get cache performance statistics: hit rate, savings, etc.",
  inputSchema: {
    type: "object",
    properties: {}
  }
}

// Response:
{
  total_requests: number,
  cache_hits: number,
  cache_misses: number,
  hit_rate: string,  // e.g., "73%"
  time_saved_seconds: number,
  oldest_entry_age_hours: number,
  cache_size_kb: number
}
```

#### Tool 10: `analyze_failure` (NEW)
```typescript
{
  name: "analyze_failure",
  description: "Analyze why Copilot failed. Returns likely causes and suggestions. Read-only, no modifications.",
  inputSchema: {
    type: "object",
    properties: {
      prompt_file: {
        type: "string",
        description: "Path to the prompt that was used"
      },
      output_file: {
        type: "string",
        description: "Path to Copilot's output (if any)"
      },
      validation_errors: {
        type: "array",
        items: { type: "string" },
        description: "Errors from copilot_validate"
      },
      expected_behavior: {
        type: "string",
        description: "What should have happened"
      }
    },
    required: ["prompt_file"]
  }
}

// Response:
{
  likely_causes: [
    {
      cause: "Missing edge case in prompt",
      confidence: 0.85,
      evidence: "Prompt didn't specify handling of None values",
      category: "incomplete_specification"
    },
    {
      cause: "Insufficient context",
      confidence: 0.60,
      evidence: "Related type definitions not included",
      category: "missing_context"
    }
  ],
  recommendations: [
    "Add explicit edge case: 'Handle None by returning default value'",
    "Include type definitions from types/user.py"
  ],
  similar_past_failures: number,
  pattern_detected: boolean
}
```

#### Tool 11: `suggest_skill_update` (NEW)
```typescript
{
  name: "suggest_skill_update",
  description: "Based on a failure or success, suggest an update to skills. REQUIRES HUMAN APPROVAL - only suggests, doesn't modify.",
  inputSchema: {
    type: "object",
    properties: {
      failure_analysis: {
        type: "object",
        description: "Output from analyze_failure"
      },
      skill_file: {
        type: "string",
        description: "Which skill to update (e.g., 'copilot_mastery.md')"
      }
    },
    required: ["failure_analysis", "skill_file"]
  }
}

// Response (PROPOSAL ONLY):
{
  skill_file: string,
  proposed_addition: string,  // Markdown text to add
  section: string,            // Which section to add to
  rationale: string,          // Why this update helps
  confidence: number,         // How confident AI is this helps
  approval_required: true     // Always true - human must approve
}

// User then calls memory_update to actually apply if they approve
```

---

### Analytics Server v2.0

#### Tool 6: `get_performance_profile` (NEW)
```typescript
{
  name: "get_performance_profile",
  description: "Detailed performance metrics for all operations. Identifies bottlenecks.",
  inputSchema: {
    type: "object",
    properties: {
      time_window: {
        type: "string",
        enum: ["hour", "day", "week"],
        description: "Time window to analyze (default: 'day')"
      }
    }
  }
}

// Response:
{
  operations: [
    {
      name: "memory_search",
      avg_duration_ms: number,
      min_duration_ms: number,
      max_duration_ms: number,
      p50_duration_ms: number,
      p95_duration_ms: number,
      p99_duration_ms: number,
      call_count: number,
      total_time_ms: number,
      percentage_of_total: number
    }
  ],
  bottlenecks: [
    {
      operation: "semantic_search",
      issue: "Embedding generation taking 300ms average",
      recommendation: "Consider caching embeddings",
      impact: "30% of total operation time"
    }
  ],
  overall_stats: {
    total_operations: number,
    total_time_seconds: number,
    avg_operation_time_ms: number
  }
}
```

#### Tool 7: `system_health` (NEW)
```typescript
{
  name: "system_health",
  description: "Overall system health check. Returns status of all components.",
  inputSchema: {
    type: "object",
    properties: {}
  }
}

// Response:
{
  overall_status: "healthy" | "degraded" | "unhealthy",
  components: {
    memory_server: {
      status: "healthy",
      response_time_ms: number,
      last_error: null | string,
      git_repo_status: "clean" | "dirty",
      disk_space_mb: number
    },
    copilot_server: {
      status: "healthy",
      gh_cli_available: boolean,
      cache_status: "healthy",
      last_error: null | string
    },
    analytics_server: {
      status: "healthy",
      budget_status: "within_limit" | "approaching_limit" | "exceeded",
      log_size_mb: number
    },
    semantic_search: {
      status: "healthy",
      index_age_hours: number,
      index_size_mb: number,
      needs_reindex: boolean
    }
  },
  alerts: [
    "Semantic index is 72 hours old, consider reindexing",
    "Budget at 85% of daily limit"
  ],
  recommendations: [
    "Run reindex_memory to improve search quality",
    "Consider increasing daily budget"
  ]
}
```

#### Tool 8: `get_skill_effectiveness` (NEW)
```typescript
{
  name: "get_skill_effectiveness",
  description: "Track which skills actually improve Copilot success rate. Correlates skill usage with outcomes.",
  inputSchema: {
    type: "object",
    properties: {
      time_window_days: {
        type: "number",
        description: "Days to analyze (default: 30)"
      }
    }
  }
}

// Implementation:
// Correlates copilot_score data with which skills were read before generation
// Returns effectiveness metrics for each skill

// Response:
{
  skills: [
    {
      name: "copilot_mastery.md",
      usage_count: number,
      avg_score_when_used: number,
      avg_score_without: number,
      improvement: number,        // Percentage points
      confidence: number,         // Statistical confidence
      effectiveness: "high" | "medium" | "low" | "unknown",
      recommendation: string
    }
  ],
  summary: {
    most_effective: string,
    least_effective: string,
    avg_improvement: number
  }
}
```

#### Tool 9: `predict_monthly_cost` (NEW)
```typescript
{
  name: "predict_monthly_cost",
  description: "Predict monthly costs based on usage patterns. Uses simple trend analysis.",
  inputSchema: {
    type: "object",
    properties: {
      include_breakdown: {
        type: "boolean",
        description: "Include breakdown by operation type (default: true)"
      }
    }
  }
}

// Implementation:
async predictMonthlyCost(): Promise<Prediction> {
  // Get last 7 days of data
  const recentCosts = await this.getCosts('week');
  
  // Calculate daily average
  const dailyAvg = recentCosts.total / 7;
  
  // Project to month (30 days)
  const projectedMonthly = dailyAvg * 30;
  
  // Calculate variance
  const dailyCosts = recentCosts.by_day;
  const variance = this.calculateVariance(dailyCosts);
  
  // Create prediction range
  const low = projectedMonthly - variance;
  const high = projectedMonthly + variance;
  
  return {
    predicted_usd: projectedMonthly,
    range_low_usd: Math.max(0, low),
    range_high_usd: high,
    confidence: this.calculateConfidence(variance),
    based_on_days: 7,
    trends: {
      increasing: this.isIncreasing(dailyCosts),
      rate_of_change: this.getRateOfChange(dailyCosts)
    }
  };
}
```

#### Tool 10: `get_bottlenecks` (NEW)
```typescript
{
  name: "get_bottlenecks",
  description: "Identify slow operations and bottlenecks in the system.",
  inputSchema: {
    type: "object",
    properties: {
      threshold_ms: {
        type: "number",
        description: "Operations slower than this are bottlenecks (default: 1000)"
      }
    }
  }
}

// Response:
{
  bottlenecks: [
    {
      operation: "semantic_search",
      avg_duration_ms: number,
      occurrences: number,
      impact: "high" | "medium" | "low",
      root_cause: string,
      optimization_suggestions: [
        "Cache embedding generation",
        "Use smaller embedding model",
        "Limit search corpus size"
      ]
    }
  ],
  overall_impact: string  // Total time lost to bottlenecks
}
```

---

## 🛡️ Safety & Approval Systems

### Human-in-Loop Pattern

All potentially dangerous operations require explicit approval:

```typescript
// Pattern for all modifying operations:

// Step 1: Analyze/Suggest (READ-ONLY)
const suggestion = await analyze_failure(...);

// Step 2: Human Reviews
// User examines the suggestion

// Step 3: Explicit Approval Required
if (user_approves) {
  await apply_suggestion(suggestion);
}

// NO operation modifies skills/memory without this flow
```

### Example: Safe Auto-Learning

```typescript
// WRONG (Autonomous):
async learnFromFailure(failure) {
  const lesson = analyzeFailure(failure);
  await updateSkill(lesson);  // ❌ Dangerous!
}

// RIGHT (Human-in-Loop):
async learnFromFailure(failure) {
  const suggestion = analyzeFailure(failure);
  return {
    proposed_update: suggestion,
    confidence: 0.85,
    requires_approval: true
  };
}

// Human calls separately:
async applySkillUpdate(suggestion) {
  // Only after reviewing
  await updateSkill(suggestion);
}
```

---

## 💾 Response Caching System

### Cache Key Generation
```typescript
function generateCacheKey(prompt: string, context: string): string {
  const content = prompt + context;
  return crypto.createHash('sha256').update(content).digest('hex');
}
```

### Cache Structure
```json
{
  "cache_key": "abc123...",
  "prompt_hash": "def456...",
  "created_at": "2024-02-16T10:30:00Z",
  "ttl_hours": 24,
  "response": {
    "output": "code here...",
    "validation_passed": true,
    "score": 5
  },
  "metadata": {
    "intent": "implement_function",
    "file_path": "src/auth.py",
    "success_count": 3
  }
}
```

### Cache Lookup Logic
```typescript
async executeCopilot(args: any) {
  // Generate cache key
  const cacheKey = this.generateCacheKey(
    args.prompt_file,
    args.context || ''
  );
  
  // Check cache
  const cached = await this.cache.get(cacheKey);
  if (cached && !this.isExpired(cached)) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "cached",
          output_file: args.output_file,
          cache_age_hours: this.getCacheAge(cached),
          note: "Returned cached response (proven successful)"
        })
      }]
    };
  }
  
  // Execute Copilot
  const result = await this.doExecuteCopilot(args);
  
  // Cache if successful
  if (result.validation_passed) {
    await this.cache.set(cacheKey, result, TTL_24H);
  }
  
  return result;
}
```

---

## 📊 Enhanced Abstract Response Pattern

All tools return summaries with metadata:

```typescript
// Standard response format:
{
  status: "success" | "error" | "cached",
  operation: string,
  summary: string,           // Human-readable summary
  metadata: {
    file: string,
    lines_changed: number,
    confidence: number,      // For memory operations
    cache_hit: boolean,      // For copilot operations
    duration_ms: number,
    tokens_saved: number     // Estimated
  },
  warnings: string[],        // Optional
  next_steps: string[]       // Optional suggestions
}

// Example:
{
  status: "success",
  operation: "copilot_execute",
  summary: "Generated authentication function with JWT",
  metadata: {
    file: "src/auth/jwt_handler.py",
    lines_changed: 47,
    cache_hit: false,
    duration_ms: 2340,
    tokens_saved: 1800  // Didn't return full code
  },
  next_steps: [
    "Run copilot_validate to check for security issues",
    "Use validate_memory to mark auth pattern as validated"
  ]
}
```

---

## 🗄️ Database Schema (SQLite with Temporal Extensions)

### Tables

#### memory_entries
```sql
CREATE TABLE memory_entries (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  file TEXT NOT NULL,
  category TEXT NOT NULL,  -- 'decision', 'lesson', 'pattern', 'core'
  
  -- Temporal metadata
  created_at TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1.0,
  last_validated TEXT NOT NULL,
  validation_count INTEGER NOT NULL DEFAULT 0,
  contradiction_count INTEGER NOT NULL DEFAULT 0,
  
  -- Optional
  tags TEXT,  -- JSON array
  related_entries TEXT,  -- JSON array of IDs
  
  -- Indexes
  indexed_at TEXT
);

CREATE INDEX idx_confidence ON memory_entries(confidence);
CREATE INDEX idx_category ON memory_entries(category);
CREATE INDEX idx_last_validated ON memory_entries(last_validated);
```

#### memory_embeddings (VSS)
```sql
CREATE VIRTUAL TABLE memory_embeddings USING vss0(
  embedding(384)  -- Dimension for all-MiniLM-L6-v2
);

-- Links to memory_entries via rowid
```

#### confidence_history
```sql
CREATE TABLE confidence_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  confidence REAL NOT NULL,
  event_type TEXT NOT NULL,  -- 'validation', 'contradiction', 'decay'
  notes TEXT,
  FOREIGN KEY (entry_id) REFERENCES memory_entries(id)
);

CREATE INDEX idx_entry_time ON confidence_history(entry_id, timestamp);
```

#### contradictions
```sql
CREATE TABLE contradictions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry1_id TEXT NOT NULL,
  entry2_id TEXT NOT NULL,
  similarity_score REAL NOT NULL,
  conflict_type TEXT NOT NULL,  -- 'direct', 'partial', 'context'
  detected_at TEXT NOT NULL,
  resolved BOOLEAN DEFAULT 0,
  resolution TEXT,
  FOREIGN KEY (entry1_id) REFERENCES memory_entries(id),
  FOREIGN KEY (entry2_id) REFERENCES memory_entries(id)
);
```

#### copilot_cache
```sql
CREATE TABLE copilot_cache (
  cache_key TEXT PRIMARY KEY,
  prompt_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  response TEXT NOT NULL,  -- JSON
  metadata TEXT NOT NULL,  -- JSON
  hit_count INTEGER DEFAULT 0
);

CREATE INDEX idx_expires ON copilot_cache(expires_at);
```

#### performance_logs
```sql
CREATE TABLE performance_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  operation TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  success BOOLEAN NOT NULL,
  metadata TEXT  -- JSON
);

CREATE INDEX idx_operation_time ON performance_logs(operation, timestamp);
```

---

## 🔄 Complete Workflow Examples

### Example 1: First-Time Setup with Temporal Memory

```
User: "Initialize memory system for a new FastAPI project"

Antigravity:
1. Calls: memory_update(tech_stack, "Python 3.12, FastAPI, PostgreSQL")
   → Creates entry with confidence=1.0, created_at=now
   
2. Calls: memory_log_decision("Use FastAPI", "...")
   → Creates decision with confidence=1.0
   
3. Calls: memory_health_report()
   → Shows: 2 entries, 100% high confidence, health_score=100
```

### Example 2: Using Patterns Over Time

```
Month 1:
User: "Implement JWT authentication"
Antigravity:
1. memory_search("authentication")
   → Finds: "Use JWT" (confidence: 1.0, created 1 day ago)
2. copilot_generate_prompt(with JWT pattern)
3. Success!
4. validate_memory(jwt_pattern_id)
   → Confidence stays 1.0, validation_count++

Month 3:
User: "Implement OAuth login"
Antigravity:
1. memory_search("authentication")
   → Finds: "Use JWT" (confidence: 0.85, not used in 60 days)
2. Uses it, but also logs new OAuth decision
3. detect_contradictions()
   → Detects: JWT vs OAuth for auth
   → Recommends: Keep both (different use cases)

Month 6:
User: "Best practice for auth?"
Antigravity:
1. memory_search("authentication", min_confidence=0.5)
   → Finds: 
      - "Use OAuth" (confidence: 0.95, used frequently)
      - "Use JWT" (confidence: 0.60, used less often)
2. Recommends OAuth primarily, mentions JWT for APIs
```

### Example 3: Auto-Learning with Approval

```
User: "Implement password hashing"

Antigravity:
1. copilot_generate_prompt(...)
2. copilot_execute(prompt)
3. copilot_validate(output)
   → FAILURE: "Missing salt generation"

4. analyze_failure(prompt, output, errors)
   → Returns:
     {
       likely_cause: "Prompt didn't specify salt",
       confidence: 0.90
     }

5. suggest_skill_update(failure_analysis, "copilot_mastery.md")
   → Returns PROPOSAL:
     {
       proposed_addition: "Always specify: 'Generate secure random salt'",
       section: "Security Patterns",
       confidence: 0.90,
       approval_required: true
     }

User: "That looks good, apply it"

6. memory_update("copilot_mastery.md", "append", proposed_addition)
   → Updates skill file
   → Git auto-commits

Next time:
User: "Implement password reset"
Antigravity reads updated skill → includes salt in prompt → Success!
```

### Example 4: Cache Optimization

```
Day 1:
User: "Create user login function"
Antigravity:
1. copilot_execute(prompt)
   → Takes 2.3 seconds
   → Returns summary (not full code)
   → Caches response

Day 2:
User: "Create admin login function" (similar prompt)
Antigravity:
1. copilot_execute(similar_prompt)
   → Cache hit! Returns in 0.05 seconds
   → Returns: "Cached response (proven successful)"
   → Tokens saved: ~2000
```

### Example 5: Memory Health Monitoring

```
Every Week:
Antigravity (automated background):
1. memory_health_report()
   → Detects: 5 entries with confidence < 0.4
   
2. detect_contradictions()
   → Finds: 2 contradictions
   
3. Generates alert:
   "Memory health: 85/100
    - 5 entries need review
    - 2 contradictions detected
    - 3 entries not validated in 90+ days"

User reviews:
1. suggest_pruning(confidence_threshold=0.3, dry_run=true)
   → Shows what would be archived
   
2. User approves: apply_pruning(entry_ids=[...], confirm=true)
   → Archives outdated patterns
   
3. Health score: 85 → 92
```

---

## 🚀 Implementation Priorities

### Phase 1: Core Temporal Memory (Week 1)
- Add confidence fields to all memory operations
- Implement decay algorithm
- Update search to rank by confidence
- Add validate_memory tool
- Add memory_health_report tool

### Phase 2: Intelligence & Safety (Week 2)
- Implement contradiction detection
- Add pruning suggestions (dry-run)
- Add analyze_failure tool
- Add suggest_skill_update tool (approval-only)
- Add undo/redo system

### Phase 3: Performance & Caching (Week 3)
- Implement response caching
- Add multi-file context gathering
- Add performance profiling
- Add health checks
- Add bottleneck detection

### Phase 4: Advanced Features (Week 4)
- Skill effectiveness tracking
- Cost prediction
- Interactive dashboard (optional)
- Export/analytics tools

---

## 📦 Dependencies

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

---

## 🎯 Success Criteria

### Functional Requirements
- ✅ All 42 tools work correctly
- ✅ Temporal memory tracks confidence accurately
- ✅ Contradiction detection finds conflicts
- ✅ Response caching saves time
- ✅ Multi-file context improves Copilot quality
- ✅ Failure analysis identifies root causes
- ✅ All suggestions require approval (no autonomous actions)
- ✅ Health monitoring catches issues early

### Performance Requirements
- ✅ Memory search with confidence: <100ms
- ✅ Contradiction detection: <5 seconds
- ✅ Cache lookup: <10ms
- ✅ Context gathering: <500ms
- ✅ Health check: <200ms

### Safety Requirements
- ✅ No autonomous file modifications
- ✅ All changes require explicit approval
- ✅ Git auto-commit on every change
- ✅ Undo capability for mistakes
- ✅ Dry-run mode for dangerous operations

### Quality Requirements
- ✅ Confidence algorithm produces accurate scores
- ✅ Decay rates are tunable
- ✅ Search results improve over time
- ✅ Skill effectiveness tracking is accurate
- ✅ Cost predictions within 20% of actual

---

## 🔧 Configuration Files

### .memory/config/temporal.json
```json
{
  "confidence": {
    "decay_rate_per_day": 0.005,
    "max_decay": 0.5,
    "validation_boost": 0.03,
    "max_validation_boost": 0.3,
    "contradiction_penalty": 0.15,
    "age_penalty_per_year": 0.1,
    "max_age_penalty": 0.3
  },
  "thresholds": {
    "high_confidence": 0.7,
    "medium_confidence": 0.4,
    "low_confidence": 0.2,
    "archive_threshold": 0.2
  },
  "auto_tasks": {
    "reindex_interval_hours": 24,
    "health_check_interval_hours": 168,
    "auto_prune": false
  }
}
```

### .memory/config/cache.json
```json
{
  "enabled": true,
  "ttl_hours": 24,
  "max_size_mb": 100,
  "eviction_policy": "lru",
  "cache_successful_only": true
}
```

### .memory/config/budget.json (Enhanced)
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
  "rate_limits": {
    "memory_update": {
      "per_minute": 10,
      "per_hour": 100
    },
    "copilot_execute": {
      "per_minute": 5,
      "per_hour": 50
    },
    "reindex_memory": {
      "per_hour": 1,
      "per_day": 5
    }
  },
  "emergency_override": false
}
```

---

## 📊 Expected Outcomes

### Token Efficiency
- **v1 System**: 90% reduction (15K → 1.5K tokens per task)
- **v2 System**: 95% reduction (15K → 750 tokens per task)
  - Confidence filtering reduces irrelevant results: -20%
  - Response caching on repeated tasks: -30%
  - Better context reduces iterations: -25%

### Cost Savings
- **Monthly**: $0.75 → $0.40 (45% additional savings)
- **Annually**: $9 → $5 (saves $4/year per user)

### Quality Improvements
- **Copilot Success Rate**: 60% → 90% (v1) → 95% (v2)
- **Outdated Pattern Usage**: Eliminated (confidence decay)
- **Contradiction Rate**: Monitored and flagged
- **Time to Proficiency**: 1 week → 2 days (system learns faster)

### Developer Experience
- **Confidence in AI**: High (approval system + undo)
- **Maintenance Burden**: Low (auto-cleanup, health monitoring)
- **Debugging Time**: -50% (detailed performance profiling)
- **Onboarding**: -70% (system explains itself through health reports)

---

## 🎓 Usage Guide

### Initial Setup

```bash
# 1. Install dependencies
npm install

# 2. Build servers
npm run build

# 3. Configure Claude Desktop
# (Use same config as v1, servers are backward compatible)

# 4. Initialize temporal memory
# In Claude Desktop:
"Run memory_health_report to initialize temporal tracking"
```

### Daily Workflow

```
Morning:
> "Run system_health to check status"
> "Get memory_health_report"

During Work:
> "Search memory for [topic]" (automatically uses confidence ranking)
> When pattern works: "Validate memory entry [id]"
> When Copilot fails: "Analyze failure and suggest skill update"

Weekly:
> "Run detect_contradictions"
> "Show suggest_pruning in dry-run mode"
> "Get skill_effectiveness report"
```

### Maintenance

```
Monthly:
> "Archive entries with confidence < 0.2"
> "Review contradiction list and resolve"
> "Check predict_monthly_cost"

Quarterly:
> "Export analytics for review"
> "Tune confidence decay rates if needed"
```

---

## 🔬 Testing Strategy

### Unit Tests
```typescript
// Test confidence calculation
describe('Temporal Memory', () => {
  it('should decay confidence over time', () => {
    const entry = createEntry({ confidence: 1.0 });
    advanceTime(100); // 100 days
    const newConfidence = calculateConfidence(entry);
    expect(newConfidence).toBeLessThan(0.7);
  });
  
  it('should boost confidence on validation', () => {
    const entry = createEntry({ confidence: 0.6 });
    validateMemory(entry.id);
    expect(entry.confidence).toBeGreaterThan(0.6);
  });
});
```

### Integration Tests
```typescript
describe('End-to-End Workflow', () => {
  it('should complete full cycle with confidence tracking', async () => {
    // Create decision
    await memory_log_decision({...});
    
    // Use it successfully
    await copilot_generate_prompt({...});
    await validate_memory(entryId);
    
    // Check confidence increased
    const entry = await getEntry(entryId);
    expect(entry.validation_count).toBe(1);
  });
});
```

---

## 📝 Migration from v1 to v2

### Automatic Migration
The system automatically upgrades v1 memory to v2 format:

```typescript
async migrateV1ToV2() {
  // Add temporal fields to existing entries
  const entries = await getAllMemoryEntries();
  
  for (const entry of entries) {
    if (!entry.confidence) {
      entry.confidence = 1.0;
      entry.created_at = entry.created_at || new Date().toISOString();
      entry.last_validated = entry.created_at;
      entry.validation_count = 0;
      entry.contradiction_count = 0;
      
      await saveEntry(entry);
    }
  }
  
  console.log(`Migrated ${entries.length} entries to v2 format`);
}
```

### No Breaking Changes
- All v1 tools still work
- v1 responses still valid
- v2 adds new features without removing old ones
- Gradual adoption: can use v2 features when ready

---

## 🎯 Final Deliverable Requirements

### For Each Server

1. **Full TypeScript Implementation**
   - All tools working correctly
   - Temporal memory system integrated
   - Caching system implemented
   - Safety guardrails in place

2. **Database Schema**
   - SQLite with VSS extension
   - Temporal metadata tables
   - Performance logging tables
   - Proper indexes

3. **Configuration**
   - Tunable parameters
   - Rate limits
   - Budget controls
   - Feature flags

4. **Documentation**
   - README per server
   - API documentation
   - Configuration guide
   - Migration guide

5. **Testing**
   - Unit tests for core logic
   - Integration tests for workflows
   - Performance benchmarks

---

## 📦 Expected Deliverable Structure

The coding agent should produce this exact structure:

```
antigravity-os-mcp/
├── package.json                    # Root package with workspaces
├── tsconfig.json                   # Root TypeScript config
├── README.md                       # Main documentation
├── SETUP.md                        # Installation guide
├── CHANGELOG.md                    # v1.0 → v2.0 changes
│
├── packages/
│   ├── memory-server/
│   │   ├── src/
│   │   │   ├── index.ts           # Main server
│   │   │   ├── temporal.ts        # Confidence calculation
│   │   │   ├── semantic-search.ts # Vector search
│   │   │   ├── git-persistence.ts # Git integration
│   │   │   ├── lock-manager.ts    # File locking
│   │   │   └── types.ts           # TypeScript interfaces
│   │   ├── build/
│   │   │   └── index.js           # Compiled output
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── test.sh               # Test script
│   │   └── README.md             # Server-specific docs
│   │
│   ├── copilot-server/
│   │   ├── src/
│   │   │   ├── index.ts           # Main server
│   │   │   ├── context-gatherer.ts # Multi-file context
│   │   │   ├── cache-manager.ts   # Response caching
│   │   │   ├── validator.ts       # Security validation
│   │   │   ├── failure-analyzer.ts # Failure analysis
│   │   │   └── types.ts
│   │   ├── build/
│   │   │   └── index.js
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── test.sh
│   │   └── README.md
│   │
│   └── analytics-server/
│       ├── src/
│       │   ├── index.ts           # Main server
│       │   ├── budget-enforcer.ts # Budget limits
│       │   ├── performance.ts     # Profiling
│       │   ├── health-monitor.ts  # System health
│       │   └── types.ts
│       ├── build/
│       │   └── index.js
│       ├── package.json
│       ├── tsconfig.json
│       ├── test.sh
│       └── README.md
│
├── examples/                       # Example configurations
│   ├── claude_desktop_config.json
│   ├── budget.json
│   ├── temporal.json
│   └── example-skills/
│       ├── forex_trading.md
│       └── copilot_mastery.md
│
└── docs/
    ├── ARCHITECTURE.md            # System design
    ├── TEMPORAL_MEMORY.md         # How confidence works
    ├── API.md                     # Tool reference
    └── MIGRATION.md               # v1 → v2 guide
```

### File Size Expectations
- Each server's `index.ts`: 500-800 lines
- Supporting modules: 100-300 lines each
- Total codebase: ~3,000-4,000 lines
- Heavy commenting expected (30% comments)

### Build Output
Each server must produce:
- `build/index.js` - Compiled, executable
- `build/index.js.map` - Source maps
- `build/*.js` - Supporting modules

---

## 🚀 Implementation Instructions for Coding Agent

Please create **3 enhanced MCP servers (v2.0)** with:

### Must-Have Features
1. ✅ **All 42 tools** fully implemented
2. ✅ **Temporal Memory** with confidence scoring and decay
3. ✅ **Response Caching** for Copilot operations
4. ✅ **Multi-file Context** gathering
5. ✅ **Failure Analysis** (read-only suggestions)
6. ✅ **Contradiction Detection** with semantic search
7. ✅ **Health Monitoring** across all components
8. ✅ **Performance Profiling** with bottleneck detection
9. ✅ **Safety Guardrails** - all modifications require approval
10. ✅ **Undo/Redo** system using git
11. ✅ **Smart Pruning** with dry-run preview
12. ✅ **Skill Effectiveness** tracking

### Database Requirements
- SQLite with better-sqlite3
- VSS extension for semantic search
- Temporal metadata tables
- Performance logging
- Cache storage

### Safety Requirements
- NO autonomous modifications
- ALL changes require explicit confirmation
- Git auto-commit on every change
- Dry-run mode for dangerous operations
- Undo capability for all operations

### Performance Requirements
- Memory search: <100ms
- Cache lookup: <10ms
- Confidence calculation: <5ms
- Health check: <200ms

### Code Quality
- TypeScript with strict types
- Comprehensive error handling
- Detailed logging (stderr)
- Well-commented code
- Consistent patterns across servers

The deliverable should be production-ready code that can be deployed immediately with all v2.0 enhancements while maintaining backward compatibility with v1.0 workflows.

---

## 🎯 Critical Implementation Notes

### 1. Project Structure
Create a monorepo structure with workspaces:
```
antigravity-os-mcp/
├── package.json              # Root with workspaces
├── packages/
│   ├── memory-server/
│   ├── copilot-server/
│   └── analytics-server/
└── README.md
```

### 2. Backward Compatibility
- All v1.0 tools MUST continue to work exactly as before
- v2.0 features are ADDITIVE, not replacements
- Default behavior matches v1.0 unless v2.0 features explicitly invoked
- Users can upgrade gradually (use v2.0 tools when ready)

### 3. Temporal Memory Bootstrap
On first run with existing v1.0 memory files:
- Auto-detect v1.0 format (no confidence field)
- Add temporal metadata with confidence=1.0
- Set created_at to file modification time or current time
- Log migration: "Upgraded N entries to v2.0 format"

### 4. Semantic Search Graceful Degradation
If embedding model fails to load or VSS unavailable:
- Log warning to stderr
- Automatically fall back to keyword search
- System remains fully functional
- Return metadata flag: `search_method: "keyword (fallback)"`

### 5. Git Integration Safety
- Initialize git repo in .memory/ if not already exists
- Use `.memory/.gitignore` to exclude semantic-index.json (too large)
- Git operations should NEVER block main operation
- If git fails, log warning but continue (don't crash)

### 6. macOS-Specific Considerations
- Use `path.join()` for all file paths (never hardcode `/`)
- Shell commands should use `sh` not `bash` (macOS compatibility)
- Ensure `gh` CLI is in PATH before executing copilot commands
- Handle macOS-specific file system case sensitivity

### 7. Environment Variables
All servers MUST respect these:
- `PROJECT_ROOT` (required): Absolute path to user's project
- `MEMORY_DIR` (optional, default: `.memory`): Memory directory name
- `NODE_ENV` (optional): Set logging verbosity
- `DISABLE_CACHE` (optional): Disable response caching for testing

### 8. Error Messages
All errors should be helpful and actionable:

❌ Bad: `Error: File not found`

✅ Good: 
```
Error: Memory file not found: core/tech_stack.md

This file doesn't exist yet. Create it by running:
  memory_update("tech_stack", "replace", "# Tech Stack\n...")

Or initialize all core files with:
  get_context_summary() // Creates default structure
```

### 9. Logging Strategy
- Use `console.error()` for all logs (goes to stderr, not JSON responses)
- Format: `[server-name] message`
- Log levels:
  - Normal operations: `[memory-server] Search completed in 45ms`
  - Warnings: `[copilot-server] Cache miss, executing Copilot`
  - Errors: `[analytics-server] ERROR: Budget exceeded`

### 10. Abstract Response Pattern Enforcement
EVERY tool response MUST follow this format:
```typescript
{
  content: [{
    type: "text",
    text: JSON.stringify({
      status: "success" | "error" | "cached",
      operation: string,
      summary: string,      // <100 chars human-readable
      metadata: {
        // Operation-specific data
        // NEVER full file contents
        // NEVER full code output
      }
    })
  }],
  isError?: boolean  // Only if status === "error"
}
```

### 11. Testing Instructions
Include a `test.sh` script in each package:
```bash
# Test that server starts
echo '{"jsonrpc":"2.0","method":"initialize",...}' | node build/index.js

# Test tools list
echo '{"jsonrpc":"2.0","method":"tools/list",...}' | node build/index.js

# Test a simple tool
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"memory_read",...}}' | PROJECT_ROOT=/tmp node build/index.js
```

---

## 📋 Domain-Specific Guidance: Forex Algo Trading

Since the user plans to build forex trading systems, here are implementation priorities:

### High-Priority Tools for Trading
1. `memory_search` with confidence ranking (find proven patterns)
2. `validate_memory` (mark successful strategies)
3. `detect_contradictions` (find conflicting strategies)
4. `memory_health_report` (track strategy performance over time)
5. `analyze_failure` (understand why strategies fail)
6. `get_skill_effectiveness` (which patterns actually help)

### Recommended Initial Skills
Create example skill templates that users can customize:

**Example: `.memory/prompts/templates/implement_indicator.md`**
```markdown
# File: {filepath}

# Context
Technical indicator for: {description}
Data source: OHLCV pandas DataFrame

# Function Signature
{function_signature}

# Requirements
- Use vectorized operations (NumPy/pandas)
- Handle missing data (NaN values)
- Validate input parameters
- Return same-length Series/DataFrame as input
- Include lookback period check

# Edge Cases
- Insufficient data (< lookback period) → raise ValueError
- All NaN values → return NaN Series
- Empty DataFrame → raise ValueError

# Performance
Target: <10ms for 10,000 bars

# Related Patterns
{from memory: proven indicator implementations}
```

### Trading-Specific Validation Patterns
Add to security validation in copilot_validate:
```typescript
const TRADING_PATTERNS = [
  { pattern: /position_size.*=.*1\.0/, message: "Suspicious: 100% position sizing" },
  { pattern: /stop_loss.*=.*0/, message: "Missing stop loss" },
  { pattern: /leverage.*>.*10/, message: "Excessive leverage detected" },
  { pattern: /\.loc\[.*future.*\]/, message: "Potential lookahead bias" },
];
```

### Example Memory Entry for Trading
```json
{
  "id": "strategy_macd_trend",
  "content": "Use MACD crossover for trend following. Works best in trending markets (ADX > 25). Min 2:1 risk/reward ratio.",
  "category": "pattern",
  "confidence": 0.85,
  "validation_count": 12,
  "tags": ["forex", "trend-following", "MACD", "indicators"],
  "metadata": {
    "win_rate": 0.45,
    "avg_rr_ratio": 2.3,
    "pairs_tested": ["EUR/USD", "GBP/USD"],
    "market_conditions": "trending"
  }
}
```

---

## ⚠️ Common Pitfalls to Avoid

### 1. Don't Over-Engineer
- Start with working v2.0 features
- Advanced features (ML prediction, etc.) can come later
- Focus on the 42 core tools first

### 2. Don't Skip Error Handling
- Every file operation needs try-catch
- Every git operation needs fallback
- Every tool call needs validation

### 3. Don't Hardcode Paths
- Use environment variables
- Use path.join() for cross-platform compatibility
- Test on the user's actual PROJECT_ROOT

### 4. Don't Block on Slow Operations
- Semantic indexing should be async/background
- Git commits should not block responses
- Cache cleanup should be lazy

### 5. Don't Return Full Content
- Abstract Response Pattern is MANDATORY
- Return summaries, not full files
- Return metadata, not full outputs
- Exception: Tools explicitly named "read" or "fetch"

---

## ✅ Pre-Implementation Checklist

Before starting implementation, ensure you understand:

- [ ] All 42 tools and their purposes
- [ ] Temporal memory confidence algorithm
- [ ] Abstract Response Pattern (return summaries only)
- [ ] Safety requirements (approval-based, no autonomy)
- [ ] Git integration for every memory change
- [ ] Semantic search with keyword fallback
- [ ] Response caching mechanism
- [ ] Performance requirements
- [ ] Error handling standards
- [ ] macOS compatibility requirements

---

## 🎯 Success Criteria Checklist

After implementation, verify:

- [ ] All 42 tools return valid MCP responses
- [ ] Temporal memory correctly calculates confidence
- [ ] Search results are ranked by confidence
- [ ] Contradictions are detected
- [ ] Git commits happen automatically
- [ ] Cache saves and retrieves responses
- [ ] Health checks run without errors
- [ ] All operations complete within performance targets
- [ ] No tool modifies files without approval
- [ ] Undo system works correctly
- [ ] Abstract responses contain summaries, not full content
- [ ] System gracefully degrades if dependencies unavailable

---

**This is the complete specification for Antigravity OS v2.0 with Temporal Memory and all safe, high-impact improvements integrated.** 🚀
