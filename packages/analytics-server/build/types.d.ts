/**
 * Antigravity OS v2.0 - Analytics Server Types
 * Type definitions for performance tracking, cost prediction, health monitoring, and rate limiting.
 */
export interface PerformanceEntry {
    id?: string;
    timestamp: string;
    server: string;
    operation: string;
    duration_ms: number;
    success: boolean;
    metadata?: string;
}
export interface OperationProfile {
    name: string;
    avg_duration_ms: number;
    min_duration_ms: number;
    max_duration_ms: number;
    p50_duration_ms: number;
    p95_duration_ms: number;
    p99_duration_ms: number;
    call_count: number;
    total_time_ms: number;
    percentage_of_total: number;
}
export interface Bottleneck {
    operation: string;
    avg_duration_ms: number;
    occurrences: number;
    impact: 'high' | 'medium' | 'low';
    root_cause?: string;
    optimization_suggestions: string[];
}
export interface HealthCheckResult {
    overall_status: 'healthy' | 'degraded' | 'unhealthy';
    components: Record<string, ComponentHealth>;
    alerts: string[];
    recommendations: string[];
}
export interface ComponentHealth {
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: Record<string, any>;
    last_error?: string;
}
export interface SkillEffectiveness {
    name: string;
    usage_count: number;
    avg_score_when_used: number;
    avg_score_without: number;
    improvement: number;
    confidence: number;
    effectiveness: 'high' | 'medium' | 'low' | 'unknown';
    recommendation: string;
}
export interface CostPrediction {
    predicted_usd: number;
    range_low_usd: number;
    range_high_usd: number;
    confidence: number;
    based_on_days: number;
    trends: {
        increasing: boolean;
        rate_of_change: number;
    };
}
export interface RateLimitConfig {
    operation: string;
    per_minute?: number;
    per_hour?: number;
    per_day?: number;
}
export interface RateLimitStatus {
    operation: string;
    per_minute?: {
        current: number;
        limit: number;
        reset_at: string;
    };
    per_hour?: {
        current: number;
        limit: number;
        reset_at: string;
    };
    per_day?: {
        current: number;
        limit: number;
        reset_at: string;
    };
}
