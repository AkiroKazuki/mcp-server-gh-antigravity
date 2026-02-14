import fs from "node:fs/promises";
import path from "node:path";
import { glob } from "glob";
/**
 * Pure-JS semantic search using @xenova/transformers.
 * Stores embeddings as JSON, performs cosine similarity in-memory.
 * Gracefully falls back if model fails to load.
 */
export class SemanticSearch {
    memoryPath;
    indexPath;
    embedder = null;
    index = null;
    initPromise = null;
    modelReady = false;
    constructor(memoryPath) {
        this.memoryPath = memoryPath;
        this.indexPath = path.join(memoryPath, "semantic-index.json");
    }
    async initialize() {
        if (this.modelReady)
            return true;
        if (this.initPromise) {
            await this.initPromise;
            return this.modelReady;
        }
        this.initPromise = this.doInitialize();
        await this.initPromise;
        return this.modelReady;
    }
    async doInitialize() {
        try {
            console.error("[semantic] Loading embedding model (one-time, ~30MB)...");
            const { pipeline } = await import("@xenova/transformers");
            this.embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
            this.modelReady = true;
            console.error("[semantic] Model loaded successfully");
            // Try to load existing index
            await this.loadIndex();
        }
        catch (err) {
            console.error(`[semantic] Model load failed: ${err.message}`);
            console.error("[semantic] Semantic search unavailable, will use keyword fallback");
            this.modelReady = false;
        }
    }
    async loadIndex() {
        try {
            const data = await fs.readFile(this.indexPath, "utf-8");
            this.index = JSON.parse(data);
            console.error(`[semantic] Loaded index with ${this.index.chunks.length} chunks`);
        }
        catch {
            this.index = null;
        }
    }
    async indexMemory() {
        const ready = await this.initialize();
        if (!ready) {
            throw new Error("Semantic search model not available. Keyword search still works.");
        }
        const files = await glob("**/*.md", { cwd: this.memoryPath, absolute: true });
        const newIndex = {
            model: "Xenova/all-MiniLM-L6-v2",
            dimension: 384,
            indexed_at: new Date().toISOString(),
            chunks: [],
        };
        for (const file of files) {
            const content = await fs.readFile(file, "utf-8");
            const chunks = this.chunkText(content, 500);
            const relPath = path.relative(this.memoryPath, file);
            for (const chunk of chunks) {
                const output = await this.embedder(chunk, {
                    pooling: "mean",
                    normalize: true,
                });
                const embedding = Array.from(output.data);
                newIndex.chunks.push({
                    file: relPath,
                    content: chunk,
                    category: this.categorizeFile(relPath),
                    embedding,
                });
            }
        }
        await fs.writeFile(this.indexPath, JSON.stringify(newIndex), "utf-8");
        this.index = newIndex;
        console.error(`[semantic] Indexed ${newIndex.chunks.length} chunks from ${files.length} files`);
        return {
            chunksIndexed: newIndex.chunks.length,
            filesProcessed: files.length,
        };
    }
    async search(query, topK = 5) {
        const ready = await this.initialize();
        if (!ready || !this.index || this.index.chunks.length === 0) {
            return [];
        }
        const output = await this.embedder(query, {
            pooling: "mean",
            normalize: true,
        });
        const queryEmbedding = Array.from(output.data);
        const scored = this.index.chunks.map((chunk) => ({
            file: chunk.file,
            content: chunk.content,
            category: chunk.category,
            similarity: this.cosineSimilarity(queryEmbedding, chunk.embedding),
        }));
        scored.sort((a, b) => b.similarity - a.similarity);
        return scored.slice(0, topK);
    }
    cosineSimilarity(a, b) {
        let dot = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        const denom = Math.sqrt(normA) * Math.sqrt(normB);
        return denom === 0 ? 0 : dot / denom;
    }
    chunkText(text, maxLength) {
        const chunks = [];
        const paragraphs = text.split("\n\n");
        let current = "";
        for (const para of paragraphs) {
            if ((current + para).length > maxLength) {
                if (current)
                    chunks.push(current.trim());
                current = para;
            }
            else {
                current += (current ? "\n\n" : "") + para;
            }
        }
        if (current)
            chunks.push(current.trim());
        return chunks.filter((c) => c.length > 50);
    }
    categorizeFile(filepath) {
        if (filepath.includes("decisions"))
            return "decision";
        if (filepath.includes("lessons"))
            return "lesson";
        if (filepath.includes("core"))
            return "core";
        if (filepath.includes("active"))
            return "active";
        if (filepath.includes("prompts"))
            return "prompt";
        return "other";
    }
}
