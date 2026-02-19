/**
 * Antigravity OS v2.0 - Database Module
 * Shared database initialization for all MCP servers.
 * Uses better-sqlite3 with WAL mode for concurrent read performance.
 */
import Database from 'better-sqlite3';
/**
 * Opens a better-sqlite3 database with WAL mode enabled for performance.
 */
export declare function openDatabase(dbPath: string): Database.Database;
/**
 * Creates memory server tables: memory_entries, confidence_history, contradictions, operation_log.
 */
export declare function initMemoryTables(db: Database.Database): void;
/**
 * Creates copilot server tables: copilot_cache with expiry index.
 */
export declare function initCopilotTables(db: Database.Database): void;
/**
 * Creates analytics server tables: performance_logs, rate_limits, rate_limit_log with indexes.
 */
export declare function initAnalyticsTables(db: Database.Database): void;
