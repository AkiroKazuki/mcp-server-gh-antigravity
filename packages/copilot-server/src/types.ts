/**
 * Antigravity OS v2.0 - Copilot Server Types
 * Type definitions for prompt caching, failure analysis, skill suggestions, and validation.
 */

export interface CacheEntry {
  cache_key: string;
  prompt_hash: string;
  created_at: string;
  expires_at: string;
  response: string;
  metadata: Record<string, unknown>;
  hit_count: number;
}

export interface FailureAnalysis {
  category:
  | 'incomplete_specification'
  | 'missing_context'
  | 'wrong_pattern'
  | 'security_gap'
  | 'quality_issue'
  | 'unknown';
  root_cause: string;
  contributing_factors: string[];
  suggested_prompt_improvements: string[];
  suggested_context_additions: string[];
  confidence: number;
}

export interface SkillSuggestion {
  skill_file: string;
  current_content_preview: string;
  suggested_additions: string[];
  suggested_removals: string[];
  rationale: string;
  priority: 'high' | 'medium' | 'low';
}

export interface ValidationIssue {
  type: 'security' | 'quality' | 'trading';
  severity: 'critical' | 'warning' | 'info';
  pattern: string;
  message: string;
  line?: number;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  cleaned_content: string;
  security_score: number;
  quality_score: number;
}
