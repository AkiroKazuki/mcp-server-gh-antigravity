/**
 * Antigravity OS v2.0 - Failure Analyzer
 * Analyzes Copilot prompt failures and suggests skill file improvements.
 * Uses pattern matching to categorize failures and determine root causes.
 */
import type { FailureAnalysis, SkillSuggestion } from './types.js';
export declare class FailureAnalyzer {
    private failurePatterns;
    constructor();
    analyze(promptFile: string, outputFile?: string, validationErrors?: string[], expected?: string): Promise<FailureAnalysis>;
    suggestSkillUpdate(analysis: FailureAnalysis, skillFile: string): Promise<SkillSuggestion>;
    private categorize;
    private determineRootCause;
    private generatePromptImprovements;
    private generateContextAdditions;
}
