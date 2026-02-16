/**
 * Antigravity OS v2.0 - Performance Profiler
 * Tracks operation timing, calculates percentiles, identifies bottlenecks.
 * Uses SQLite for persistent storage.
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { OperationProfile, Bottleneck } from './types.js';

export class PerformanceProfiler {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initTables();
  }

  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS performance_logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        server TEXT NOT NULL,
        operation TEXT NOT NULL,
        duration_ms REAL NOT NULL,
        success INTEGER NOT NULL DEFAULT 1,
        metadata TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_pl_timestamp ON performance_logs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_pl_server ON performance_logs(server);
      CREATE INDEX IF NOT EXISTS idx_pl_operation ON performance_logs(operation);
    `);
  }

  logOperation(
    server: string,
    operation: string,
    durationMs: number,
    success: boolean,
    metadata?: Record<string, unknown>
  ): void {
    const stmt = this.db.prepare(
      `INSERT INTO performance_logs (id, server, operation, duration_ms, success, metadata)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    stmt.run(
      randomUUID(),
      server,
      operation,
      durationMs,
      success ? 1 : 0,
      metadata ? JSON.stringify(metadata) : null
    );
  }

  getProfile(timeWindow: 'hour' | 'day' | 'week' = 'day'): {
    time_window: string;
    operations: OperationProfile[];
    total_operations: number;
    total_time_ms: number;
    avg_duration_ms: number;
  } {
    const windowMap = {
      hour: "-1 hour",
      day: "-1 day",
      week: "-7 days",
    };

    const rows = this.db.prepare(
      `SELECT operation, duration_ms FROM performance_logs
       WHERE timestamp >= datetime('now', ?)
       ORDER BY operation, duration_ms`
    ).all(windowMap[timeWindow]) as Array<{ operation: string; duration_ms: number }>;

    if (rows.length === 0) {
      return {
        time_window: timeWindow,
        operations: [],
        total_operations: 0,
        total_time_ms: 0,
        avg_duration_ms: 0,
      };
    }

    // Group by operation
    const groups = new Map<string, number[]>();
    for (const row of rows) {
      const arr = groups.get(row.operation) || [];
      arr.push(row.duration_ms);
      groups.set(row.operation, arr);
    }

    const totalTime = rows.reduce((s, r) => s + r.duration_ms, 0);
    const operations: OperationProfile[] = [];

    for (const [name, durations] of groups) {
      durations.sort((a, b) => a - b);
      const count = durations.length;
      const total = durations.reduce((s, d) => s + d, 0);

      operations.push({
        name,
        avg_duration_ms: Math.round(total / count * 100) / 100,
        min_duration_ms: durations[0],
        max_duration_ms: durations[count - 1],
        p50_duration_ms: this.percentile(durations, 0.5),
        p95_duration_ms: this.percentile(durations, 0.95),
        p99_duration_ms: this.percentile(durations, 0.99),
        call_count: count,
        total_time_ms: Math.round(total * 100) / 100,
        percentage_of_total: Math.round((total / totalTime) * 10000) / 100,
      });
    }

    operations.sort((a, b) => b.total_time_ms - a.total_time_ms);

    return {
      time_window: timeWindow,
      operations,
      total_operations: rows.length,
      total_time_ms: Math.round(totalTime * 100) / 100,
      avg_duration_ms: Math.round((totalTime / rows.length) * 100) / 100,
    };
  }

  getBottlenecks(thresholdMs: number = 1000): Bottleneck[] {
    const rows = this.db.prepare(
      `SELECT operation, AVG(duration_ms) as avg_ms, COUNT(*) as cnt
       FROM performance_logs
       WHERE timestamp >= datetime('now', '-7 days')
       GROUP BY operation
       HAVING avg_ms > ?
       ORDER BY avg_ms DESC`
    ).all(thresholdMs) as Array<{ operation: string; avg_ms: number; cnt: number }>;

    return rows.map((row) => {
      const impact: Bottleneck['impact'] =
        row.avg_ms > thresholdMs * 3 ? 'high' :
          row.avg_ms > thresholdMs * 1.5 ? 'medium' : 'low';

      const suggestions: string[] = [];
      if (row.avg_ms > 5000) suggestions.push('Consider adding caching for this operation');
      if (row.cnt > 100) suggestions.push('High call frequency — consider batching');
      if (impact === 'high') suggestions.push('Investigate root cause — operation significantly exceeds threshold');
      if (suggestions.length === 0) suggestions.push('Monitor — currently above threshold but manageable');

      return {
        operation: row.operation,
        avg_duration_ms: Math.round(row.avg_ms * 100) / 100,
        occurrences: row.cnt,
        impact,
        optimization_suggestions: suggestions,
      };
    });
  }

  getRecentLogs(limit: number = 20): Array<{
    id: string;
    timestamp: string;
    server: string;
    operation: string;
    duration_ms: number;
    success: boolean;
  }> {
    const rows = this.db.prepare(
      `SELECT id, timestamp, server, operation, duration_ms, success
       FROM performance_logs
       ORDER BY timestamp DESC
       LIMIT ?`
    ).all(limit) as Array<{
      id: string; timestamp: string; server: string;
      operation: string; duration_ms: number; success: number;
    }>;

    return rows.map((r) => ({ ...r, success: r.success === 1 }));
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    if (sorted.length === 1) return sorted[0];
    const idx = Math.ceil(p * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
  }

  close(): void {
    this.db.close();
  }
}
