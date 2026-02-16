/**
 * Antigravity OS v2.0 - Temporal Memory Manager
 * Manages the confidence lifecycle for memory entries using SQLite via better-sqlite3.
 * Implements time-based decay, validation boosts, contradiction penalties, and
 * automatic pruning recommendations based on configurable thresholds.
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';
import { openDatabase, initMemoryTables } from './database.js';
import type {
  MemoryEntry,
  ConfidenceStatus,
  HealthReport,
  PruningCandidate,
  OperationLogEntry,
} from './types.js';

export class TemporalMemory {
  private db: Database.Database;
  private memoryPath: string;

  constructor(dbPath: string, memoryPath: string) {
    this.db = openDatabase(dbPath);
    this.memoryPath = memoryPath;
    initMemoryTables(this.db);
  }

  /**
   * Calculates the confidence score for a memory entry based on the temporal algorithm.
   *
   * confidence = base (1.0)
   *   - min(daysSinceValidation * 0.005, 0.5)       // time decay
   *   + min(validation_count * 0.03, 0.3)            // validation boost
   *   - contradiction_count * 0.15                    // contradiction penalty
   *   - (category !== 'core' ? min(ageYears * 0.1, 0.3) : 0)  // age penalty
   *   clamped to [0, 1]
   */
  calculateConfidence(entry: MemoryEntry): number {
    const now = Date.now();
    const lastValidated = new Date(entry.last_validated).getTime();
    const createdAt = new Date(entry.created_at).getTime();

    const daysSinceValidation = (now - lastValidated) / (1000 * 60 * 60 * 24);
    const ageYears = (now - createdAt) / (1000 * 60 * 60 * 24 * 365.25);

    const base = 1.0;
    const timeDecay = Math.min(daysSinceValidation * 0.005, 0.5);
    const validationBoost = Math.min(entry.validation_count * 0.03, 0.3);
    const contradictionPenalty = entry.contradiction_count * 0.15;
    const agePenalty = entry.category !== 'core' ? Math.min(ageYears * 0.1, 0.3) : 0;

    const confidence = base - timeDecay + validationBoost - contradictionPenalty - agePenalty;

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Maps a numeric confidence value to a named status tier.
   */
  getConfidenceStatus(confidence: number): ConfidenceStatus {
    if (confidence >= 0.7) return 'high';
    if (confidence >= 0.4) return 'medium';
    if (confidence >= 0.2) return 'low';
    return 'obsolete';
  }

  /**
   * Creates a new memory entry and persists it to the database.
   * Logs the creation event to confidence_history.
   */
  createEntry(
    content: string,
    file: string,
    category: MemoryEntry['category'],
    section?: string,
    tags?: string[],
  ): MemoryEntry {
    const id = randomUUID();
    const now = new Date().toISOString();
    const confidence = 1.0;
    const tagsArray = tags ?? [];
    const relatedEntries: string[] = [];

    const entry: MemoryEntry = {
      id,
      content,
      file,
      section,
      category,
      created_at: now,
      confidence,
      last_validated: now,
      validation_count: 0,
      contradiction_count: 0,
      tags: tagsArray,
      related_entries: relatedEntries,
    };

    const insertEntry = this.db.prepare(`
      INSERT INTO memory_entries (id, content, file, section, category, created_at, confidence, last_validated, validation_count, contradiction_count, tags, related_entries)
      VALUES (@id, @content, @file, @section, @category, @created_at, @confidence, @last_validated, @validation_count, @contradiction_count, @tags, @related_entries)
    `);

    const insertHistory = this.db.prepare(`
      INSERT INTO confidence_history (entry_id, old_confidence, new_confidence, reason, timestamp)
      VALUES (@entry_id, @old_confidence, @new_confidence, @reason, @timestamp)
    `);

    const transaction = this.db.transaction(() => {
      insertEntry.run({
        id: entry.id,
        content: entry.content,
        file: entry.file,
        section: entry.section ?? null,
        category: entry.category,
        created_at: entry.created_at,
        confidence: entry.confidence,
        last_validated: entry.last_validated,
        validation_count: entry.validation_count,
        contradiction_count: entry.contradiction_count,
        tags: JSON.stringify(entry.tags),
        related_entries: JSON.stringify(entry.related_entries),
      });

      insertHistory.run({
        entry_id: entry.id,
        old_confidence: 0,
        new_confidence: entry.confidence,
        reason: 'creation',
        timestamp: now,
      });
    });

    transaction();

    return entry;
  }

  /**
   * Retrieves a single memory entry by id, or null if not found.
   */
  getEntry(id: string): MemoryEntry | null {
    const stmt = this.db.prepare('SELECT * FROM memory_entries WHERE id = ?');
    const row = stmt.get(id) as Record<string, unknown> | undefined;

    if (!row) return null;

    return this.rowToEntry(row);
  }

  /**
   * Retrieves all memory entries, optionally filtered by category and/or minimum confidence.
   */
  getAllEntries(category?: string, minConfidence?: number): MemoryEntry[] {
    let sql = 'SELECT * FROM memory_entries WHERE 1=1';
    const params: unknown[] = [];

    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }

    if (minConfidence !== undefined) {
      sql += ' AND confidence >= ?';
      params.push(minConfidence);
    }

    sql += ' ORDER BY confidence DESC, created_at DESC';

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as Record<string, unknown>[];

    return rows.map((row) => this.rowToEntry(row));
  }

  /**
   * Updates the content of an existing memory entry.
   */
  updateEntryContent(id: string, newContent: string): void {
    const stmt = this.db.prepare('UPDATE memory_entries SET content = ? WHERE id = ?');
    stmt.run(newContent, id);
  }

  /**
   * Validates an entry by incrementing its validation count, updating last_validated,
   * recalculating confidence, and logging to confidence_history.
   */
  validateEntry(
    id: string,
    notes?: string,
  ): { new_confidence: number; status: ConfidenceStatus } {
    const entry = this.getEntry(id);
    if (!entry) {
      throw new Error(`Entry not found: ${id}`);
    }

    const now = new Date().toISOString();
    const oldConfidence = entry.confidence;

    entry.validation_count += 1;
    entry.last_validated = now;

    const newConfidence = this.calculateConfidence(entry);
    const status = this.getConfidenceStatus(newConfidence);

    const updateStmt = this.db.prepare(`
      UPDATE memory_entries
      SET validation_count = ?, last_validated = ?, confidence = ?
      WHERE id = ?
    `);

    const historyStmt = this.db.prepare(`
      INSERT INTO confidence_history (entry_id, old_confidence, new_confidence, reason, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `);

    const reason = notes ? `validation: ${notes}` : 'validation';

    const transaction = this.db.transaction(() => {
      updateStmt.run(entry.validation_count, now, newConfidence, id);
      historyStmt.run(id, oldConfidence, newConfidence, reason, now);
    });

    transaction();

    return { new_confidence: newConfidence, status };
  }

  /**
   * Records a contradiction count update for an entry, recalculates confidence,
   * and logs the change to confidence_history.
   */
  recordContradiction(entryId: string, count: number): void {
    const entry = this.getEntry(entryId);
    if (!entry) {
      throw new Error(`Entry not found: ${entryId}`);
    }

    const now = new Date().toISOString();
    const oldConfidence = entry.confidence;

    entry.contradiction_count = count;
    const newConfidence = this.calculateConfidence(entry);

    const updateStmt = this.db.prepare(`
      UPDATE memory_entries SET contradiction_count = ?, confidence = ? WHERE id = ?
    `);

    const historyStmt = this.db.prepare(`
      INSERT INTO confidence_history (entry_id, old_confidence, new_confidence, reason, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction(() => {
      updateStmt.run(count, newConfidence, entryId);
      historyStmt.run(
        entryId,
        oldConfidence,
        newConfidence,
        `contradiction_count updated to ${count}`,
        now,
      );
    });

    transaction();
  }

  /**
   * Generates a comprehensive health report across all memory entries.
   * health_score = 40% avg_confidence + 30% validation_coverage + 30% (1 - obsolete_ratio)
   */
  getHealthReport(): HealthReport {
    const entries = this.getAllEntries();
    const totalEntries = entries.length;

    if (totalEntries === 0) {
      return {
        summary: {
          total_entries: 0,
          by_confidence: { high: 0, medium: 0, low: 0, obsolete: 0 },
          avg_confidence: 0,
          avg_age_days: 0,
        },
        alerts: [],
        recommendations: [],
        health_score: 100,
      };
    }

    const now = Date.now();
    const distribution = { high: 0, medium: 0, low: 0, obsolete: 0 };
    let totalConfidence = 0;
    let totalAgeDays = 0;
    let validatedCount = 0;

    const alertMessages: string[] = [];
    const obsoleteEntries: string[] = [];
    const mediumEntries: string[] = [];
    const contradictionEntries: string[] = [];
    const neverValidatedOldEntries: string[] = [];

    for (const entry of entries) {
      const confidence = entry.confidence;
      const status = this.getConfidenceStatus(confidence);
      distribution[status] += 1;
      totalConfidence += confidence;

      const ageDays = (now - new Date(entry.created_at).getTime()) / (1000 * 60 * 60 * 24);
      totalAgeDays += ageDays;

      if (entry.validation_count > 0) {
        validatedCount += 1;
      }

      // Collect alerts
      if (confidence < 0.2) {
        alertMessages.push(
          `Entry "${entry.id}" has critically low confidence (${confidence.toFixed(3)})`,
        );
        obsoleteEntries.push(entry.id);
      }

      if (entry.validation_count === 0 && ageDays > 30) {
        alertMessages.push(
          `Entry "${entry.id}" has never been validated and is ${Math.floor(ageDays)} days old`,
        );
        neverValidatedOldEntries.push(entry.id);
      }

      if (entry.contradiction_count > 0) {
        alertMessages.push(
          `Entry "${entry.id}" has ${entry.contradiction_count} contradiction(s)`,
        );
        contradictionEntries.push(entry.id);
      }

      if (status === 'medium') {
        mediumEntries.push(entry.id);
      }
    }

    const avgConfidence = totalConfidence / totalEntries;
    const avgAgeDays = totalAgeDays / totalEntries;
    const validationCoverage = validatedCount / totalEntries;
    const obsoleteRatio = distribution.obsolete / totalEntries;

    // health_score = weighted: 40% avg_confidence + 30% validation_coverage + 30% (1 - obsolete_ratio)
    const healthScore = Math.round(
      (avgConfidence * 0.4 + validationCoverage * 0.3 + (1 - obsoleteRatio) * 0.3) * 100,
    );

    const recommendations: Array<{ action: string; entries: string[]; reason: string }> = [];

    if (mediumEntries.length > 0) {
      recommendations.push({
        action: 'validate',
        entries: mediumEntries,
        reason: 'Medium confidence entries that would benefit from validation to maintain relevance',
      });
    }

    if (contradictionEntries.length > 0) {
      recommendations.push({
        action: 'review',
        entries: contradictionEntries,
        reason: 'Entries with contradictions that need manual review to resolve conflicts',
      });
    }

    if (obsoleteEntries.length > 0) {
      recommendations.push({
        action: 'prune',
        entries: obsoleteEntries,
        reason: 'Obsolete entries with very low confidence that should be archived or removed',
      });
    }

    return {
      summary: {
        total_entries: totalEntries,
        by_confidence: distribution,
        avg_confidence: parseFloat(avgConfidence.toFixed(4)),
        avg_age_days: parseFloat(avgAgeDays.toFixed(2)),
      },
      alerts: alertMessages,
      recommendations,
      health_score: Math.max(0, Math.min(100, healthScore)),
    };
  }

  /**
   * Returns entries that are candidates for pruning based on confidence and age thresholds.
   * Default threshold: 0.3 confidence, 90 days age.
   * Finds entries below threshold OR older than ageDays with confidence < 0.5.
   */
  getPruningCandidates(confidenceThreshold?: number, ageDays?: number): PruningCandidate[] {
    const threshold = confidenceThreshold ?? 0.3;
    const maxAgeDays = ageDays ?? 90;

    const entries = this.getAllEntries();
    const now = Date.now();
    const candidates: PruningCandidate[] = [];

    for (const entry of entries) {
      const entryAgeDays =
        (now - new Date(entry.created_at).getTime()) / (1000 * 60 * 60 * 24);

      let reason: string | null = null;

      if (entry.confidence < threshold) {
        reason = `Confidence ${entry.confidence.toFixed(3)} is below threshold ${threshold}`;
      } else if (entryAgeDays > maxAgeDays && entry.confidence < 0.5) {
        reason = `Entry is ${Math.floor(entryAgeDays)} days old with confidence ${entry.confidence.toFixed(3)} (< 0.5)`;
      }

      if (reason) {
        candidates.push({
          entry_id: entry.id,
          content_preview: entry.content.substring(0, 100),
          confidence: entry.confidence,
          age_days: parseFloat(entryAgeDays.toFixed(2)),
          last_validated: entry.last_validated,
          reason,
        });
      }
    }

    return candidates.sort((a, b) => a.confidence - b.confidence);
  }

  /**
   * Archives (deletes) entries by their ids and returns the count of archived entries.
   */
  archiveEntries(ids: string[]): { archived: number } {
    if (ids.length === 0) {
      return { archived: 0 };
    }

    const placeholders = ids.map(() => '?').join(', ');
    const stmt = this.db.prepare(
      `DELETE FROM memory_entries WHERE id IN (${placeholders})`,
    );

    const result = stmt.run(...ids);

    return { archived: result.changes };
  }

  /**
   * Logs an operation to the operation_log table.
   */
  logOperation(
    operation: string,
    file?: string,
    commitHash?: string,
    entryId?: string,
    details?: string,
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO operation_log (id, timestamp, operation, file, commit_hash, entry_id, details)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      randomUUID(),
      new Date().toISOString(),
      operation,
      file ?? null,
      commitHash ?? null,
      entryId ?? null,
      details ?? null,
    );
  }

  /**
   * Returns the most recent operations from the operation_log.
   */
  getRecentOperations(count?: number): OperationLogEntry[] {
    const limit = count ?? 10;
    const stmt = this.db.prepare(
      'SELECT * FROM operation_log ORDER BY timestamp DESC LIMIT ?',
    );
    const rows = stmt.all(limit) as Record<string, unknown>[];

    return rows.map((row) => ({
      id: row.id as string,
      timestamp: row.timestamp as string,
      operation: row.operation as string,
      file: (row.file as string) ?? undefined,
      commit_hash: (row.commit_hash as string) ?? undefined,
      entry_id: (row.entry_id as string) ?? undefined,
      details: (row.details as string) ?? undefined,
    }));
  }

  /**
   * Applies temporal decay to all entries by recalculating confidence.
   * Updates the database for entries whose confidence has changed.
   * Returns the count of updated entries.
   */
  applyDecay(): number {
    const entries = this.getAllEntries();
    const now = new Date().toISOString();

    const updateStmt = this.db.prepare(
      'UPDATE memory_entries SET confidence = ? WHERE id = ?',
    );

    const historyStmt = this.db.prepare(`
      INSERT INTO confidence_history (entry_id, old_confidence, new_confidence, reason, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `);

    let updatedCount = 0;

    const transaction = this.db.transaction(() => {
      for (const entry of entries) {
        const newConfidence = this.calculateConfidence(entry);
        const oldConfidence = entry.confidence;

        // Only update if confidence has meaningfully changed (avoid floating point noise)
        if (Math.abs(newConfidence - oldConfidence) > 0.0001) {
          updateStmt.run(newConfidence, entry.id);
          historyStmt.run(entry.id, oldConfidence, newConfidence, 'temporal_decay', now);
          updatedCount += 1;
        }
      }
    });

    transaction();

    return updatedCount;
  }

  /**
   * Scans the memoryPath for markdown files, parses them into sections by ## headers,
   * and creates new entries in the database for sections that do not already exist.
   * Returns the number of new entries created.
   */
  async syncFromMarkdown(): Promise<number> {
    const pattern = path.join(this.memoryPath, '**/*.md');
    const files = await glob(pattern, { nodir: true });

    let newEntries = 0;

    for (const filePath of files) {
      const content = await fs.readFile(filePath, 'utf-8');
      const relativePath = path.relative(this.memoryPath, filePath);
      const category = this.categoryFromPath(relativePath);
      const sections = this.parseMarkdownSections(content);

      for (const section of sections) {
        // Check if entry already exists for this file+section combination
        const existingStmt = this.db.prepare(
          'SELECT id FROM memory_entries WHERE file = ? AND section = ?',
        );
        const existing = existingStmt.get(relativePath, section.heading);

        if (!existing) {
          this.createEntry(section.content, relativePath, category, section.heading);
          newEntries += 1;
        }
      }
    }

    return newEntries;
  }

  /**
   * Closes the database connection.
   */
  close(): void {
    this.db.close();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Converts a raw database row into a typed MemoryEntry, parsing JSON fields.
   */
  private rowToEntry(row: Record<string, unknown>): MemoryEntry {
    return {
      id: row.id as string,
      content: row.content as string,
      file: row.file as string,
      section: (row.section as string) ?? undefined,
      category: row.category as MemoryEntry['category'],
      created_at: row.created_at as string,
      confidence: row.confidence as number,
      last_validated: row.last_validated as string,
      validation_count: row.validation_count as number,
      contradiction_count: row.contradiction_count as number,
      tags: JSON.parse((row.tags as string) || '[]'),
      related_entries: JSON.parse((row.related_entries as string) || '[]'),
    };
  }

  /**
   * Infers a memory category from the file path relative to memoryPath.
   * Maps known directory names to categories, defaulting to 'active'.
   */
  private categoryFromPath(relativePath: string): MemoryEntry['category'] {
    const lower = relativePath.toLowerCase();

    if (lower.includes('decision')) return 'decision';
    if (lower.includes('lesson')) return 'lesson';
    if (lower.includes('pattern')) return 'pattern';
    if (lower.includes('core')) return 'core';

    return 'active';
  }

  /**
   * Parses markdown content into sections delineated by ## headers.
   * Returns an array of { heading, content } objects.
   * Content before the first heading is captured with heading 'introduction'.
   */
  private parseMarkdownSections(
    content: string,
  ): Array<{ heading: string; content: string }> {
    const lines = content.split('\n');
    const sections: Array<{ heading: string; content: string }> = [];
    let currentHeading = 'introduction';
    let currentLines: string[] = [];

    for (const line of lines) {
      const headerMatch = line.match(/^## (.+)/);
      if (headerMatch) {
        // Save previous section if it has content
        const sectionContent = currentLines.join('\n').trim();
        if (sectionContent.length > 0) {
          sections.push({ heading: currentHeading, content: sectionContent });
        }
        currentHeading = headerMatch[1].trim();
        currentLines = [];
      } else {
        currentLines.push(line);
      }
    }

    // Save the last section
    const sectionContent = currentLines.join('\n').trim();
    if (sectionContent.length > 0) {
      sections.push({ heading: currentHeading, content: sectionContent });
    }

    return sections;
  }
}
