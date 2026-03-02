import type Database from "better-sqlite3";
import type { Validator } from "../validator.js";
import type { CacheManager } from "../cache-manager.js";
import type { ContextGatherer } from "../context-gatherer.js";
import type { FailureAnalyzer } from "../failure-analyzer.js";
import type { LoopDetector } from "../loop-detector.js";
import type { CliExecutor } from "../cli-executor.js";
import type { ResearchIntegration } from "../research-integration.js";

export interface CopilotContext {
  validator: Validator;
  cache: CacheManager;
  contextGatherer: ContextGatherer;
  failureAnalyzer: FailureAnalyzer;
  loopDetector: LoopDetector;
  cliExecutor: CliExecutor;
  researchIntegration: ResearchIntegration;
  db: Database.Database;
  memoryPath: string;
  skillsDir: string;
  generatedDir: string;
}
