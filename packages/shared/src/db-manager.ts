/**
 * Antigravity OS v2.2 - Database Connection Manager
 * Manages shared database connections with reference counting.
 * Ensures a single WAL-mode connection per file path across the process.
 */

import Database from "better-sqlite3";

const connections = new Map<string, { db: Database.Database; refs: number }>();

/**
 * Get or create a shared database connection for the given path.
 * Uses WAL mode and busy timeout (5s) by default.
 * Call releaseConnection() when done.
 */
export function getConnection(dbPath: string, options?: { timeout?: number }): Database.Database {
  const existing = connections.get(dbPath);
  if (existing) {
    existing.refs++;
    return existing.db;
  }

  const db = new Database(dbPath, { timeout: options?.timeout ?? 5000 });
  db.pragma("journal_mode = WAL");
  connections.set(dbPath, { db, refs: 1 });
  return db;
}

/**
 * Release a reference to a shared connection.
 * Closes the connection when the last reference is released.
 */
export function releaseConnection(dbPath: string): void {
  const entry = connections.get(dbPath);
  if (!entry) return;
  entry.refs--;
  if (entry.refs <= 0) {
    try {
      entry.db.close();
    } catch {
      // Already closed
    }
    connections.delete(dbPath);
  }
}

/**
 * Get connection count (for diagnostics).
 */
export function getActiveConnections(): number {
  return connections.size;
}
