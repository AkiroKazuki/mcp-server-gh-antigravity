/**
 * Antigravity OS v2.0 - Memory Server Types
 * Core type definitions for the temporal memory management system.
 */
export interface MemoryEntry {
    id: string;
    content: string;
    file: string;
    section?: string;
    category: 'decision' | 'lesson' | 'pattern' | 'core' | 'active';
    created_at: string;
    confidence: number;
    last_validated: string;
    validation_count: number;
    contradiction_count: number;
    tags: string[];
    related_entries: string[];
}
export type ConfidenceStatus = 'high' | 'medium' | 'low' | 'obsolete';
export interface Contradiction {
    id?: string;
    entry1_id: string;
    entry2_id: string;
    similarity_score: number;
    conflict_type: 'direct' | 'partial' | 'context';
    detected_at?: string;
    resolved?: boolean;
    resolution?: string;
    recommendation?: string;
}
export interface HealthReport {
    summary: {
        total_entries: number;
        by_confidence: {
            high: number;
            medium: number;
            low: number;
            obsolete: number;
        };
        avg_confidence: number;
        avg_age_days: number;
    };
    alerts: string[];
    recommendations: Array<{
        action: string;
        entries: string[];
        reason: string;
    }>;
    health_score: number;
}
export interface PruningCandidate {
    entry_id: string;
    content_preview: string;
    confidence: number;
    age_days: number;
    last_validated: string;
    reason: string;
}
export interface OperationLogEntry {
    id?: string;
    timestamp: string;
    operation: string;
    file?: string;
    commit_hash?: string;
    entry_id?: string;
    details?: string;
}
