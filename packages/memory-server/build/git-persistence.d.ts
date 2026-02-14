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
}
