/**
 * Antigravity OS v2.0 - Cache Manager
 * Prompt response caching with SQLite backend and hit-rate analytics.
 * Inlines database setup to avoid cross-package imports.
 */
import type { CacheEntry } from './types.js';
export declare class CacheManager {
    private db;
    private totalRequests;
    private cacheHits;
    private defaultTtlHours;
    constructor(dbPath: string, defaultTtlHours?: number);
    generateKey(prompt: string, context: string): string;
    get(key: string): CacheEntry | null;
    set(key: string, response: string, metadata?: Record<string, unknown>, ttlHours?: number): void;
    clear(scope: 'all' | 'expired' | 'today'): {
        cleared: number;
    };
    getStats(): {
        total_entries: number;
        total_requests: number;
        cache_hits: number;
        cache_misses: number;
        hit_rate: string;
        avg_hit_count: number;
    };
    evictExpired(): number;
    close(): void;
}
