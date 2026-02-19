/**
 * Antigravity OS v2.0 - Validator
 * Security, quality, and trading validation for Copilot output.
 * Also includes CLI output cleaning (replaces cli-cleaner.ts).
 */
import type { ValidationResult } from './types.js';
export declare class Validator {
    private securityPatterns;
    private qualityPatterns;
    private tradingPatterns;
    constructor();
    validate(content: string, requirements?: string[]): ValidationResult;
    stripCliJunk(output: string): string;
}
