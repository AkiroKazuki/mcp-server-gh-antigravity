/**
 * Antigravity OS v2.0 - Cache Manager
 * Prompt response caching with SQLite backend and hit-rate analytics.
 * Inlines database setup to avoid cross-package imports.
 */
import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
export class CacheManager {
    db;
    totalRequests = 0;
    cacheHits = 0;
    defaultTtlHours;
    constructor(dbPath, defaultTtlHours) {
        this.defaultTtlHours = defaultTtlHours ?? 24;
        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL');
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS copilot_cache (
        cache_key TEXT PRIMARY KEY,
        prompt_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL,
        response TEXT NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}',
        hit_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_copilot_cache_expires ON copilot_cache(expires_at);
    `);
    }
    generateKey(prompt, context) {
        return createHash('sha256').update(prompt + '::' + context).digest('hex');
    }
    get(key) {
        this.totalRequests++;
        const row = this.db
            .prepare(`SELECT cache_key, prompt_hash, created_at, expires_at, response, metadata, hit_count
         FROM copilot_cache
         WHERE cache_key = ? AND expires_at > datetime('now')`)
            .get(key);
        if (!row) {
            return null;
        }
        // Increment hit_count in database
        this.db
            .prepare(`UPDATE copilot_cache SET hit_count = hit_count + 1 WHERE cache_key = ?`)
            .run(key);
        this.cacheHits++;
        return {
            cache_key: row.cache_key,
            prompt_hash: row.prompt_hash,
            created_at: row.created_at,
            expires_at: row.expires_at,
            response: row.response,
            metadata: JSON.parse(row.metadata),
            hit_count: row.hit_count + 1,
        };
    }
    set(key, response, metadata, ttlHours) {
        const ttl = ttlHours ?? this.defaultTtlHours;
        const promptHash = createHash('sha256').update(response).digest('hex').slice(0, 16);
        const metadataStr = JSON.stringify(metadata ?? {});
        this.db
            .prepare(`INSERT OR REPLACE INTO copilot_cache (cache_key, prompt_hash, created_at, expires_at, response, metadata, hit_count)
         VALUES (?, ?, datetime('now'), datetime('now', '+' || ? || ' hours'), ?, ?, 0)`)
            .run(key, promptHash, ttl, response, metadataStr);
    }
    clear(scope) {
        let result;
        switch (scope) {
            case 'all':
                result = this.db.prepare(`DELETE FROM copilot_cache`).run();
                break;
            case 'expired':
                result = this.db
                    .prepare(`DELETE FROM copilot_cache WHERE expires_at < datetime('now')`)
                    .run();
                break;
            case 'today': {
                const today = new Date().toISOString().slice(0, 10);
                result = this.db
                    .prepare(`DELETE FROM copilot_cache WHERE created_at LIKE ? || '%'`)
                    .run(today);
                break;
            }
        }
        return { cleared: result.changes };
    }
    getStats() {
        const countRow = this.db
            .prepare(`SELECT COUNT(*) AS cnt FROM copilot_cache`)
            .get();
        const avgRow = this.db
            .prepare(`SELECT COALESCE(AVG(hit_count), 0) AS avg_hits FROM copilot_cache`)
            .get();
        const totalEntries = countRow.cnt;
        const cacheMisses = this.totalRequests - this.cacheHits;
        const hitRate = this.totalRequests > 0
            ? ((this.cacheHits / this.totalRequests) * 100).toFixed(1) + '%'
            : '0.0%';
        return {
            total_entries: totalEntries,
            total_requests: this.totalRequests,
            cache_hits: this.cacheHits,
            cache_misses: cacheMisses,
            hit_rate: hitRate,
            avg_hit_count: Math.round(avgRow.avg_hits * 100) / 100,
        };
    }
    evictExpired() {
        const result = this.db
            .prepare(`DELETE FROM copilot_cache WHERE expires_at < datetime('now')`)
            .run();
        return result.changes;
    }
    close() {
        this.db.close();
    }
}
