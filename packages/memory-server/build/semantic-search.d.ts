/**
 * Pure-JS semantic search using @xenova/transformers.
 * Stores embeddings as JSON, performs cosine similarity in-memory.
 * Gracefully falls back if model fails to load.
 */
export declare class SemanticSearch {
    private memoryPath;
    private indexPath;
    private embedder;
    private index;
    private initPromise;
    private modelReady;
    constructor(memoryPath: string);
    initialize(): Promise<boolean>;
    private doInitialize;
    private loadIndex;
    indexMemory(): Promise<{
        chunksIndexed: number;
        filesProcessed: number;
    }>;
    search(query: string, topK?: number): Promise<Array<{
        file: string;
        content: string;
        category: string;
        similarity: number;
    }>>;
    private cosineSimilarity;
    private chunkText;
    /**
     * Compute pairwise similarity between two text contents.
     * Used for contradiction detection.
     */
    pairwiseSimilarity(text1: string, text2: string): Promise<number>;
    /**
     * Search with minimum similarity threshold.
     */
    searchWithThreshold(query: string, topK?: number, minSimilarity?: number): Promise<Array<{
        file: string;
        content: string;
        category: string;
        similarity: number;
    }>>;
    isReady(): boolean;
    hasIndex(): boolean;
    private categorizeFile;
}
