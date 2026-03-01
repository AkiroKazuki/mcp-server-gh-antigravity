import fs from "node:fs/promises";
import path from "node:path";
import { glob } from "glob";
import type Database from "better-sqlite3";

interface ChunkEntry {
  file: string;
  content: string;
  category: string;
  embedding: number[];
}

/**
 * Pure-JS semantic search using @xenova/transformers.
 * Stores embeddings in SQLite (semantic_chunks table) for incremental updates.
 * Gracefully falls back if model fails to load.
 */
export class SemanticSearch {
  private memoryPath: string;
  private db: Database.Database | null = null;
  private embedder: any = null;
  private initPromise: Promise<void> | null = null;
  private modelReady: boolean = false;
  private dimension = 384;

  constructor(memoryPath: string) {
    this.memoryPath = memoryPath;
  }

  /** Set the database connection (called after DB is initialized). */
  setDatabase(db: Database.Database): void {
    this.db = db;
  }

  async initialize(): Promise<boolean> {
    if (this.modelReady) return true;

    if (this.initPromise) {
      await this.initPromise;
      return this.modelReady;
    }

    this.initPromise = this.doInitialize();
    await this.initPromise;
    return this.modelReady;
  }

  private async doInitialize(): Promise<void> {
    try {
      console.error("[semantic] Loading embedding model (one-time, ~30MB)...");
      const { pipeline } = await import("@xenova/transformers");
      this.embedder = await pipeline(
        "feature-extraction",
        "Xenova/all-MiniLM-L6-v2"
      );
      this.modelReady = true;
      console.error("[semantic] Model loaded successfully");

      // Migrate from legacy JSON file if it exists and DB is empty
      await this.migrateFromJson();
    } catch (err: any) {
      console.error(`[semantic] Model load failed: ${err.message}`);
      console.error("[semantic] Semantic search unavailable, will use keyword fallback");
      this.modelReady = false;
    }
  }

  /** One-time migration from semantic-index.json to SQLite. */
  private async migrateFromJson(): Promise<void> {
    if (!this.db) return;
    const jsonPath = path.join(this.memoryPath, "semantic-index.json");
    try {
      const count = (this.db.prepare("SELECT COUNT(*) as cnt FROM semantic_chunks").get() as any).cnt;
      if (count > 0) return; // Already have data

      const data = await fs.readFile(jsonPath, "utf-8");
      const legacy = JSON.parse(data) as { chunks: ChunkEntry[] };
      if (!legacy.chunks?.length) return;

      const insert = this.db.prepare(
        "INSERT INTO semantic_chunks (file, content, category, embedding) VALUES (?, ?, ?, ?)"
      );
      const migrate = this.db.transaction((chunks: ChunkEntry[]) => {
        for (const chunk of chunks) {
          insert.run(chunk.file, chunk.content, chunk.category, this.toBlob(chunk.embedding));
        }
      });
      migrate(legacy.chunks);
      console.error(`[semantic] Migrated ${legacy.chunks.length} chunks from JSON to SQLite`);

      // Rename old file so it's not re-read
      await fs.rename(jsonPath, jsonPath + ".bak").catch(() => {});
    } catch {
      // No JSON file or parse error — that's fine
    }
  }

  async indexMemory(): Promise<{ chunksIndexed: number; filesProcessed: number }> {
    const ready = await this.initialize();
    if (!ready) {
      throw new Error("Semantic search model not available. Keyword search still works.");
    }
    if (!this.db) {
      throw new Error("Database not initialized for semantic search.");
    }

    const files = await glob("**/*.md", { cwd: this.memoryPath, absolute: true });

    const insert = this.db.prepare(
      "INSERT INTO semantic_chunks (file, content, category, embedding, indexed_at) VALUES (?, ?, ?, ?, datetime('now'))"
    );

    // Clear existing index and rebuild
    this.db.prepare("DELETE FROM semantic_chunks").run();

    let chunksIndexed = 0;
    for (const file of files) {
      const content = await fs.readFile(file, "utf-8");
      const chunks = this.chunkText(content, 500);
      const relPath = path.relative(this.memoryPath, file);
      const category = this.categorizeFile(relPath);

      for (const chunk of chunks) {
        const output = await this.embedder(chunk, {
          pooling: "mean",
          normalize: true,
        });
        const embedding = Array.from(output.data) as number[];
        insert.run(relPath, chunk, category, this.toBlob(embedding));
        chunksIndexed++;
      }
    }

    console.error(
      `[semantic] Indexed ${chunksIndexed} chunks from ${files.length} files`
    );

    return { chunksIndexed, filesProcessed: files.length };
  }

  async search(
    query: string,
    topK: number = 5
  ): Promise<Array<{ file: string; content: string; category: string; similarity: number }>> {
    const ready = await this.initialize();
    if (!ready || !this.db) return [];

    const rows = this.db.prepare(
      "SELECT file, content, category, embedding FROM semantic_chunks"
    ).all() as Array<{ file: string; content: string; category: string; embedding: Buffer }>;

    if (rows.length === 0) return [];

    const output = await this.embedder(query, {
      pooling: "mean",
      normalize: true,
    });
    const queryEmbedding = Array.from(output.data) as number[];

    const scored = rows.map((row) => ({
      file: row.file,
      content: row.content,
      category: row.category,
      similarity: this.cosineSimilarity(queryEmbedding, this.fromBlob(row.embedding)),
    }));

    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, topK);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
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

  private chunkText(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    const paragraphs = text.split("\n\n");

    let current = "";
    for (const para of paragraphs) {
      if ((current + para).length > maxLength) {
        if (current) chunks.push(current.trim());
        current = para;
      } else {
        current += (current ? "\n\n" : "") + para;
      }
    }
    if (current) chunks.push(current.trim());

    return chunks.filter((c) => c.length > 50);
  }

  /**
   * Compute pairwise similarity between two text contents.
   * Used for contradiction detection.
   */
  async pairwiseSimilarity(text1: string, text2: string): Promise<number> {
    const ready = await this.initialize();
    if (!ready) return 0;

    const output1 = await this.embedder(text1, { pooling: "mean", normalize: true });
    const output2 = await this.embedder(text2, { pooling: "mean", normalize: true });

    const embedding1 = Array.from(output1.data) as number[];
    const embedding2 = Array.from(output2.data) as number[];

    return this.cosineSimilarity(embedding1, embedding2);
  }

  /**
   * Find entries similar to the given text using the stored index.
   * Used for cluster-first contradiction detection.
   */
  async findSimilar(
    text: string,
    topK: number = 10,
    minSimilarity: number = 0.5
  ): Promise<Array<{ file: string; content: string; category: string; similarity: number }>> {
    const results = await this.search(text, topK * 2);
    return results.filter((r) => r.similarity >= minSimilarity).slice(0, topK);
  }

  /**
   * Search with minimum similarity threshold.
   */
  async searchWithThreshold(
    query: string,
    topK: number = 5,
    minSimilarity: number = 0.3
  ): Promise<Array<{ file: string; content: string; category: string; similarity: number }>> {
    const results = await this.search(query, topK * 2);
    return results.filter((r) => r.similarity >= minSimilarity).slice(0, topK);
  }

  isReady(): boolean {
    return this.modelReady;
  }

  hasIndex(): boolean {
    if (!this.db) return false;
    const row = this.db.prepare("SELECT COUNT(*) as cnt FROM semantic_chunks").get() as any;
    return row.cnt > 0;
  }

  getChunkCount(): number {
    if (!this.db) return 0;
    return (this.db.prepare("SELECT COUNT(*) as cnt FROM semantic_chunks").get() as any).cnt;
  }

  private categorizeFile(filepath: string): string {
    if (filepath.includes("decisions")) return "decision";
    if (filepath.includes("lessons")) return "lesson";
    if (filepath.includes("core")) return "core";
    if (filepath.includes("active")) return "active";
    if (filepath.includes("prompts")) return "prompt";
    return "other";
  }

  /** Convert float[] to Buffer for BLOB storage. */
  private toBlob(embedding: number[]): Buffer {
    const buf = Buffer.alloc(embedding.length * 4);
    for (let i = 0; i < embedding.length; i++) {
      buf.writeFloatLE(embedding[i], i * 4);
    }
    return buf;
  }

  /** Convert BLOB Buffer back to float[]. */
  private fromBlob(buf: Buffer): number[] {
    const arr: number[] = [];
    for (let i = 0; i < buf.length; i += 4) {
      arr.push(buf.readFloatLE(i));
    }
    return arr;
  }
}
