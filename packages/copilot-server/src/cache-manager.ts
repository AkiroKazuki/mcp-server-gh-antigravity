/**
 * Antigravity OS v2.0 - Cache Manager
 * Prompt response caching with SQLite backend and hit-rate analytics.
 * Inlines database setup to avoid cross-package imports.
 */

import { getConnection } from '@antigravity-os/shared';
import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { CacheEntry } from './types.js';

export class CacheManager {
  private db: Database.Database;
  private totalRequests: number = 0;
  private cacheHits: number = 0;
  private defaultTtlHours: number;

  constructor(dbPath: string, defaultTtlHours?: number) {
    this.defaultTtlHours = defaultTtlHours ?? 24;

    this.db = getConnection(dbPath);

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

  generateKey(prompt: string, context: string): string {
    return createHash('sha256').update(prompt + '::' + context).digest('hex');
  }

  get(key: string): CacheEntry | null {
    this.totalRequests++;

    const row = this.db
      .prepare(
        `SELECT cache_key, prompt_hash, created_at, expires_at, response, metadata, hit_count
         FROM copilot_cache
         WHERE cache_key = ? AND expires_at > datetime('now')`
      )
      .get(key) as
      | {
        cache_key: string;
        prompt_hash: string;
        created_at: string;
        expires_at: string;
        response: string;
        metadata: string;
        hit_count: number;
      }
      | undefined;

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
      metadata: JSON.parse(row.metadata) as Record<string, unknown>,
      hit_count: row.hit_count + 1,
    };
  }

  set(
    key: string,
    response: string,
    metadata?: Record<string, unknown>,
    ttlHours?: number
  ): void {
    const ttl = ttlHours ?? this.defaultTtlHours;
    const promptHash = createHash('sha256').update(response).digest('hex').slice(0, 16);
    const metadataStr = JSON.stringify(metadata ?? {});

    this.db
      .prepare(
        `INSERT OR REPLACE INTO copilot_cache (cache_key, prompt_hash, created_at, expires_at, response, metadata, hit_count)
         VALUES (?, ?, datetime('now'), datetime('now', '+' || ? || ' hours'), ?, ?, 0)`
      )
      .run(key, promptHash, ttl, response, metadataStr);
  }

  clear(scope: 'all' | 'expired' | 'today'): { cleared: number } {
    let result: Database.RunResult;

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

  getStats(): {
    total_entries: number;
    total_requests: number;
    cache_hits: number;
    cache_misses: number;
    hit_rate: string;
    avg_hit_count: number;
  } {
    const countRow = this.db
      .prepare(`SELECT COUNT(*) AS cnt FROM copilot_cache`)
      .get() as { cnt: number };

    const avgRow = this.db
      .prepare(`SELECT COALESCE(AVG(hit_count), 0) AS avg_hits FROM copilot_cache`)
      .get() as { avg_hits: number };

    const totalEntries = countRow.cnt;
    const cacheMisses = this.totalRequests - this.cacheHits;
    const hitRate =
      this.totalRequests > 0
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

  evictExpired(): number {
    const result = this.db
      .prepare(`DELETE FROM copilot_cache WHERE expires_at < datetime('now')`)
      .run();
    return result.changes;
  }

  close(): void {
    this.db.close();
  }
}
