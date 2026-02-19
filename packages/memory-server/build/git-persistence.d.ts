/**
 * Git-backed persistence for .memory/ directory.
 * Auto-commits every change, supports history viewing and rollback.
 */
export declare class GitPersistence {
    private memoryPath;
    private initialized;
    constructor(memoryPath: string);
    init(): Promise<void>;
    commitChanges(file: string, operation: string, description: string): Promise<void>;
    getHistory(file: string, limit?: number): Promise<Array<{
        hash: string;
        message: string;
    }>>;
    rollback(file: string, commitHash: string): Promise<void>;
    getDiff(file: string, commitHash?: string): Promise<string>;
    /**
     * Get recent commit hashes and messages across all files.
     */
    getRecentOperations(limit?: number): Promise<Array<{
        hash: string;
        message: string;
        timestamp: string;
        files: string[];
    }>>;
    /**
     * Get the latest commit hash (HEAD).
     */
    getLatestCommitHash(): Promise<string | null>;
    /**
     * Commit all changes (for bulk operations).
     */
    commitAll(operation: string, description: string): Promise<string | null>;
}
