/**
 * Security and quality validation patterns for Copilot output.
 * Also includes CLI output cleaning.
 */
export interface ValidationIssue {
    type: "security" | "quality";
    severity: "error" | "warning";
    message: string;
    line?: number;
    pattern: string;
}
export declare const SECURITY_PATTERNS: {
    pattern: RegExp;
    message: string;
}[];
export declare const QUALITY_PATTERNS: ({
    pattern: RegExp;
    message: string;
    severity: "warning";
    antiPattern?: undefined;
} | {
    pattern: RegExp;
    antiPattern: RegExp;
    message: string;
    severity: "warning";
})[];
/**
 * Strip CLI junk from Copilot output to save tokens.
 */
export declare function stripCliJunk(output: string): string;
/**
 * Run security and quality validation on file content.
 */
export declare function validateCode(content: string): ValidationIssue[];
