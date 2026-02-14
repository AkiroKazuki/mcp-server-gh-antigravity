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
    private categorizeFile;
}
