/**
 * Antigravity OS v2.0 - Database Module
 * Shared database initialization for all MCP servers.
 * Uses better-sqlite3 with WAL mode for concurrent read performance.
 */
import Database from 'better-sqlite3';
/**
 * Opens a better-sqlite3 database with WAL mode enabled for performance.
 */
export function openDatabase(dbPath) {
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    return db;
}
/**
 * Creates memory server tables: memory_entries, confidence_history, contradictions, operation_log.
 */
export function initMemoryTables(db) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS memory_entries (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      file TEXT NOT NULL,
      section TEXT,
      category TEXT NOT NULL CHECK(category IN ('decision', 'lesson', 'pattern', 'core', 'active')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      confidence REAL NOT NULL DEFAULT 1.0,
      last_validated TEXT NOT NULL DEFAULT (datetime('now')),
      validation_count INTEGER NOT NULL DEFAULT 0,
      contradiction_count INTEGER NOT NULL DEFAULT 0,
      tags TEXT NOT NULL DEFAULT '[]',
      related_entries TEXT NOT NULL DEFAULT '[]'
    );

    CREATE INDEX IF NOT EXISTS idx_memory_entries_category ON memory_entries(category);
    CREATE INDEX IF NOT EXISTS idx_memory_entries_confidence ON memory_entries(confidence);
    CREATE INDEX IF NOT EXISTS idx_memory_entries_file ON memory_entries(file);
    CREATE INDEX IF NOT EXISTS idx_memory_entries_last_validated ON memory_entries(last_validated);

    CREATE TABLE IF NOT EXISTS confidence_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id TEXT NOT NULL,
      old_confidence REAL NOT NULL,
      new_confidence REAL NOT NULL,
      reason TEXT NOT NULL,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (entry_id) REFERENCES memory_entries(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_confidence_history_entry_id ON confidence_history(entry_id);

    CREATE TABLE IF NOT EXISTS contradictions (
      id TEXT PRIMARY KEY,
      entry1_id TEXT NOT NULL,
      entry2_id TEXT NOT NULL,
      similarity_score REAL NOT NULL,
      conflict_type TEXT NOT NULL CHECK(conflict_type IN ('direct', 'partial', 'context')),
      detected_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved INTEGER NOT NULL DEFAULT 0,
      resolution TEXT,
      recommendation TEXT,
      FOREIGN KEY (entry1_id) REFERENCES memory_entries(id) ON DELETE CASCADE,
      FOREIGN KEY (entry2_id) REFERENCES memory_entries(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_contradictions_entry1 ON contradictions(entry1_id);
    CREATE INDEX IF NOT EXISTS idx_contradictions_entry2 ON contradictions(entry2_id);
    CREATE INDEX IF NOT EXISTS idx_contradictions_resolved ON contradictions(resolved);

    CREATE TABLE IF NOT EXISTS operation_log (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      operation TEXT NOT NULL,
      file TEXT,
      commit_hash TEXT,
      entry_id TEXT,
      details TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_operation_log_timestamp ON operation_log(timestamp);
    CREATE INDEX IF NOT EXISTS idx_operation_log_operation ON operation_log(operation);
  `);
}
/**
 * Creates copilot server tables: copilot_cache with expiry index.
 */
export function initCopilotTables(db) {
    db.exec(`
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
/**
 * Creates analytics server tables: performance_logs, rate_limits, rate_limit_log with indexes.
 */
export function initAnalyticsTables(db) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS performance_logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      server TEXT NOT NULL,
      operation TEXT NOT NULL,
      duration_ms REAL NOT NULL,
      success INTEGER NOT NULL DEFAULT 1,
      metadata TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_performance_logs_timestamp ON performance_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_performance_logs_server ON performance_logs(server);
    CREATE INDEX IF NOT EXISTS idx_performance_logs_operation ON performance_logs(operation);

    CREATE TABLE IF NOT EXISTS rate_limits (
      operation TEXT PRIMARY KEY,
      per_minute INTEGER,
      per_hour INTEGER,
      per_day INTEGER
    );

    CREATE TABLE IF NOT EXISTS rate_limit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation TEXT NOT NULL,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      allowed INTEGER NOT NULL DEFAULT 1
    );

    CREATE INDEX IF NOT EXISTS idx_rate_limit_log_operation ON rate_limit_log(operation);
    CREATE INDEX IF NOT EXISTS idx_rate_limit_log_timestamp ON rate_limit_log(timestamp);
  `);
}
