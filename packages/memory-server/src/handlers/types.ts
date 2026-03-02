import type { FileLockManager } from "@antigravity-os/shared";
import type { GitPersistence } from "../git-persistence.js";
import type { SemanticSearch } from "../semantic-search.js";
import type { TemporalMemory } from "../temporal.js";
import type { ResearchImporter } from "../research-importer.js";

export interface MemoryContext {
  lockManager: FileLockManager;
  git: GitPersistence;
  semantic: SemanticSearch;
  temporal: TemporalMemory;
  research: ResearchImporter;
  memoryPath: string;
  fileMap: Record<string, string>;
  categoryDirs: Record<string, string>;
}
