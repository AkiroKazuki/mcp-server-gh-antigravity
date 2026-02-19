/**
 * Antigravity OS v2.0 - Performance Profiler
 * Tracks operation timing, calculates percentiles, identifies bottlenecks.
 * Uses SQLite for persistent storage.
 */
import type { OperationProfile, Bottleneck } from './types.js';
export declare class PerformanceProfiler {
    private db;
    constructor(dbPath: string);
    private initTables;
    logOperation(server: string, operation: string, durationMs: number, success: boolean, metadata?: Record<string, unknown>): void;
    getProfile(timeWindow?: 'hour' | 'day' | 'week'): {
        time_window: string;
        operations: OperationProfile[];
        total_operations: number;
        total_time_ms: number;
        avg_duration_ms: number;
    };
    getBottlenecks(thresholdMs?: number): Bottleneck[];
    getRecentLogs(limit?: number): Array<{
        id: string;
        timestamp: string;
        server: string;
        operation: string;
        duration_ms: number;
        success: boolean;
    }>;
    private percentile;
    close(): void;
}
