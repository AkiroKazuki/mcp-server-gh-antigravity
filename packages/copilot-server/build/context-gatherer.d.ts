/**
 * Antigravity OS v2.0 - Context Gatherer
 * Extracts imports, type definitions, signatures, and recent changes to build
 * context for Copilot prompts. Limits output to 10000 chars.
 */
export declare class ContextGatherer {
    private projectRoot;
    constructor(projectRoot: string);
    gatherContext(targetFile: string, options?: {
        maxDepth?: number;
        includeTypes?: boolean;
        includeGitDiff?: boolean;
    }): Promise<string>;
    extractImports(filePath: string): Promise<string[]>;
    resolveImport(importRef: string, baseDir: string): Promise<string | null>;
    extractSignatures(filePath: string): Promise<string>;
    findBaseClasses(filePath: string): Promise<string[]>;
    getRecentRelatedChanges(filePath: string): Promise<string>;
    extractTypeDefinitions(filePath: string): Promise<string>;
}
