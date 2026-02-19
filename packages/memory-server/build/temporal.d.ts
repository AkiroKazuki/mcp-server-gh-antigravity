/**
 * Antigravity OS v2.0 - Temporal Memory Manager
 * Manages the confidence lifecycle for memory entries using SQLite via better-sqlite3.
 * Implements time-based decay, validation boosts, contradiction penalties, and
 * automatic pruning recommendations based on configurable thresholds.
 */
import type { MemoryEntry, ConfidenceStatus, HealthReport, PruningCandidate, OperationLogEntry } from './types.js';
export declare class TemporalMemory {
    private db;
    private memoryPath;
    constructor(dbPath: string, memoryPath: string);
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
    calculateConfidence(entry: MemoryEntry): number;
    /**
     * Maps a numeric confidence value to a named status tier.
     */
    getConfidenceStatus(confidence: number): ConfidenceStatus;
    /**
     * Creates a new memory entry and persists it to the database.
     * Logs the creation event to confidence_history.
     */
    createEntry(content: string, file: string, category: MemoryEntry['category'], section?: string, tags?: string[]): MemoryEntry;
    /**
     * Retrieves a single memory entry by id, or null if not found.
     */
    getEntry(id: string): MemoryEntry | null;
    /**
     * Retrieves all memory entries, optionally filtered by category and/or minimum confidence.
     */
    getAllEntries(category?: string, minConfidence?: number): MemoryEntry[];
    /**
     * Updates the content of an existing memory entry.
     */
    updateEntryContent(id: string, newContent: string): void;
    /**
     * Validates an entry by incrementing its validation count, updating last_validated,
     * recalculating confidence, and logging to confidence_history.
     */
    validateEntry(id: string, notes?: string): {
        new_confidence: number;
        status: ConfidenceStatus;
    };
    /**
     * Records a contradiction count update for an entry, recalculates confidence,
     * and logs the change to confidence_history.
     */
    recordContradiction(entryId: string, count: number): void;
    /**
     * Generates a comprehensive health report across all memory entries.
     * health_score = 40% avg_confidence + 30% validation_coverage + 30% (1 - obsolete_ratio)
     */
    getHealthReport(): HealthReport;
    /**
     * Returns entries that are candidates for pruning based on confidence and age thresholds.
     * Default threshold: 0.3 confidence, 90 days age.
     * Finds entries below threshold OR older than ageDays with confidence < 0.5.
     */
    getPruningCandidates(confidenceThreshold?: number, ageDays?: number): PruningCandidate[];
    /**
     * Archives (deletes) entries by their ids and returns the count of archived entries.
     */
    archiveEntries(ids: string[]): {
        archived: number;
    };
    /**
     * Logs an operation to the operation_log table.
     */
    logOperation(operation: string, file?: string, commitHash?: string, entryId?: string, details?: string): void;
    /**
     * Returns the most recent operations from the operation_log.
     */
    getRecentOperations(count?: number): OperationLogEntry[];
    /**
     * Applies temporal decay to all entries by recalculating confidence.
     * Updates the database for entries whose confidence has changed.
     * Returns the count of updated entries.
     */
    applyDecay(): number;
    /**
     * Scans the memoryPath for markdown files, parses them into sections by ## headers,
     * and creates new entries in the database for sections that do not already exist.
     * Returns the number of new entries created.
     */
    syncFromMarkdown(): Promise<number>;
    /**
     * Closes the database connection.
     */
    close(): void;
    /**
     * Converts a raw database row into a typed MemoryEntry, parsing JSON fields.
     */
    private rowToEntry;
    /**
     * Infers a memory category from the file path relative to memoryPath.
     * Maps known directory names to categories, defaulting to 'active'.
     */
    private categoryFromPath;
    /**
     * Parses markdown content into sections delineated by ## headers.
     * Returns an array of { heading, content } objects.
     * Content before the first heading is captured with heading 'introduction'.
     */
    private parseMarkdownSections;
}
