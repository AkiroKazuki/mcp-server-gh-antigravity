/**
 * Antigravity OS v2.0 - Failure Analyzer
 * Analyzes Copilot prompt failures and suggests skill file improvements.
 * Uses pattern matching to categorize failures and determine root causes.
 */
import fs from 'node:fs/promises';
export class FailureAnalyzer {
    failurePatterns;
    constructor() {
        this.failurePatterns = [
            {
                category: 'incomplete_specification',
                indicators: [
                    /missing\s+(required\s+)?param(eter)?s?/i,
                    /undefined\s+behavior/i,
                    /ambiguous\s+(requirement|spec|description)/i,
                    /not\s+specified/i,
                    /unclear\s+(what|how|when|where|which)/i,
                    /incomplete\s+(type|interface|definition)/i,
                    /expected\s+\d+\s+arguments?\s+but\s+got\s+\d+/i,
                    /property\s+['"]?\w+['"]?\s+is\s+missing/i,
                ],
                weight: 3,
            },
            {
                category: 'missing_context',
                indicators: [
                    /cannot\s+find\s+module/i,
                    /import\s+error/i,
                    /undefined\s+(reference|variable|name)/i,
                    /is\s+not\s+defined/i,
                    /no\s+such\s+file/i,
                    /wrong\s+api\s+usage/i,
                    /unknown\s+(type|identifier|module)/i,
                    /has\s+no\s+exported?\s+member/i,
                    /could\s+not\s+resolve/i,
                ],
                weight: 3,
            },
            {
                category: 'wrong_pattern',
                indicators: [
                    /anti[-\s]?pattern/i,
                    /deprecated\s+(api|method|function|class)/i,
                    /incorrect\s+(architecture|pattern|approach)/i,
                    /should\s+(not\s+)?use\s+/i,
                    /instead\s+of\s+using/i,
                    /legacy\s+(code|pattern|api)/i,
                    /consider\s+using\s+.*instead/i,
                ],
                weight: 2,
            },
            {
                category: 'security_gap',
                indicators: [
                    /vulnerab(le|ility)/i,
                    /unsafe\s+(practice|code|operation)/i,
                    /security\s+(issue|warning|error|risk)/i,
                    /injection\s+(attack|risk|vulnerab)/i,
                    /unvalidated\s+(input|data)/i,
                    /unsaniti[sz]ed/i,
                    /\bxss\b/i,
                    /\bcsrf\b/i,
                ],
                weight: 4,
            },
            {
                category: 'quality_issue',
                indicators: [
                    /poor\s+naming/i,
                    /no\s+error\s+handling/i,
                    /missing\s+type(s|\s+annotation)?/i,
                    /unhandled\s+(error|exception|rejection|promise)/i,
                    /empty\s+catch/i,
                    /\bany\b\s+type/i,
                    /no\s+(documentation|docstring|comment)/i,
                    /code\s+(smell|duplication)/i,
                ],
                weight: 1,
            },
        ];
    }
    async analyze(promptFile, outputFile, validationErrors, expected) {
        let promptContent;
        try {
            promptContent = await fs.readFile(promptFile, 'utf-8');
        }
        catch {
            promptContent = '';
        }
        let outputContent = '';
        if (outputFile) {
            try {
                outputContent = await fs.readFile(outputFile, 'utf-8');
            }
            catch {
                outputContent = '';
            }
        }
        const errors = validationErrors ?? [];
        const { category, confidence, factors } = this.categorize(promptContent, outputContent, errors);
        const rootCause = this.determineRootCause(category, promptContent, outputContent, errors, expected);
        const promptImprovements = this.generatePromptImprovements(category, promptContent, outputContent, errors);
        const contextAdditions = this.generateContextAdditions(category, promptContent, outputContent, errors);
        return {
            category,
            root_cause: rootCause,
            contributing_factors: factors,
            suggested_prompt_improvements: promptImprovements,
            suggested_context_additions: contextAdditions,
            confidence,
        };
    }
    async suggestSkillUpdate(analysis, skillFile) {
        let skillContent;
        try {
            skillContent = await fs.readFile(skillFile, 'utf-8');
        }
        catch {
            skillContent = '';
        }
        const preview = skillContent.slice(0, 200);
        const additions = [];
        const removals = [];
        let rationale = '';
        let priority = 'medium';
        switch (analysis.category) {
            case 'incomplete_specification':
                additions.push('Add checklist: Ensure all function parameters are explicitly typed', 'Add rule: Every prompt must include expected input/output examples', 'Add rule: Specify error handling requirements explicitly');
                removals.push('Remove any vague instructions like "handle appropriately"');
                rationale =
                    'Failures stem from incomplete specifications. Adding explicit checklists will force completeness.';
                priority = 'high';
                break;
            case 'missing_context':
                additions.push('Add rule: Always include import paths for referenced modules', 'Add rule: Provide type definitions for all external dependencies', 'Add rule: Include relevant file structure context');
                removals.push('Remove assumptions about available imports or global state');
                rationale =
                    'Missing context leads to unresolved references. Adding context requirements prevents this.';
                priority = 'high';
                break;
            case 'wrong_pattern':
                additions.push('Add section: Preferred patterns and architectures', 'Add rule: Reference latest API versions and deprecation notices', 'Add anti-pattern examples to avoid');
                removals.push('Remove references to deprecated APIs or outdated patterns');
                rationale =
                    'Wrong patterns indicate outdated skill guidance. Updating pattern recommendations fixes this.';
                priority = 'medium';
                break;
            case 'security_gap':
                additions.push('Add mandatory security checklist before code acceptance', 'Add rule: All user input must be validated and sanitized', 'Add rule: No hardcoded credentials or secrets', 'Add rule: Use parameterized queries for all database operations');
                removals.push('Remove any examples that demonstrate insecure practices');
                rationale =
                    'Security gaps require mandatory security checks in the skill file.';
                priority = 'high';
                break;
            case 'quality_issue':
                additions.push('Add rule: All public functions must have type annotations', 'Add rule: Error handling must be explicit (no empty catch blocks)', 'Add rule: Include JSDoc/docstrings for public API');
                removals.push('Remove tolerance for "any" types or missing documentation');
                rationale =
                    'Quality issues indicate relaxed standards. Tightening quality rules addresses this.';
                priority = 'low';
                break;
            case 'unknown':
            default:
                additions.push('Add more detailed failure logging for unclassified failures', 'Add rule: Include validation criteria in every prompt');
                rationale =
                    'Failure could not be classified. Adding better logging and validation criteria will help identify future failures.';
                priority = 'medium';
                break;
        }
        // Add suggestions from the analysis itself
        for (const improvement of analysis.suggested_prompt_improvements) {
            if (!additions.includes(improvement)) {
                additions.push(`From analysis: ${improvement}`);
            }
        }
        return {
            skill_file: skillFile,
            current_content_preview: preview,
            suggested_additions: additions,
            suggested_removals: removals,
            rationale,
            priority,
        };
    }
    categorize(prompt, output, errors) {
        const combinedText = [prompt, output, ...errors].join('\n');
        const factors = [];
        let bestCategory = 'unknown';
        let bestScore = 0;
        let totalChecked = 0;
        let totalMatched = 0;
        for (const fp of this.failurePatterns) {
            let matchCount = 0;
            for (const indicator of fp.indicators) {
                totalChecked++;
                if (indicator.test(combinedText)) {
                    matchCount++;
                    totalMatched++;
                    factors.push(`[${fp.category}] Matched: ${indicator.source.slice(0, 60)}`);
                }
            }
            const weightedScore = matchCount * fp.weight;
            if (weightedScore > bestScore) {
                bestScore = weightedScore;
                bestCategory = fp.category;
            }
        }
        // Additional heuristics from common error shapes
        if (bestCategory === 'unknown') {
            if (prompt.length < 100) {
                bestCategory = 'incomplete_specification';
                factors.push('Prompt is very short (< 100 chars)');
                totalMatched++;
            }
            else if (output.length === 0 && errors.length === 0) {
                bestCategory = 'incomplete_specification';
                factors.push('No output or errors produced');
                totalMatched++;
            }
            else if (errors.length > 3) {
                bestCategory = 'missing_context';
                factors.push('Multiple errors suggest missing context');
                totalMatched++;
            }
            totalChecked += 3;
        }
        const confidence = totalChecked > 0
            ? Math.min(1, Math.round((totalMatched / totalChecked) * 100) / 100)
            : 0;
        return { category: bestCategory, confidence, factors };
    }
    determineRootCause(category, prompt, output, errors, expected) {
        switch (category) {
            case 'incomplete_specification':
                if (prompt.length < 100) {
                    return 'Prompt is too brief and lacks sufficient detail for the AI to produce correct output.';
                }
                if (errors.some((e) => /param|argument/i.test(e))) {
                    return 'Prompt does not specify all required parameters or their types, causing incorrect function signatures.';
                }
                return 'The specification is incomplete - key requirements, edge cases, or expected behaviors are not described.';
            case 'missing_context':
                if (errors.some((e) => /module|import|require/i.test(e))) {
                    return 'Required module imports or dependencies are not available or not specified in the prompt context.';
                }
                if (errors.some((e) => /undefined|not defined/i.test(e))) {
                    return 'Variables or types referenced in the prompt are not defined or imported in the surrounding context.';
                }
                return 'The prompt lacks necessary context about the codebase structure, available APIs, or type definitions.';
            case 'wrong_pattern':
                if (errors.some((e) => /deprecated/i.test(e))) {
                    return 'The generated code uses deprecated APIs or patterns that are no longer recommended.';
                }
                return 'The generated code follows incorrect architectural patterns or uses anti-patterns for the project.';
            case 'security_gap':
                if (errors.some((e) => /inject/i.test(e))) {
                    return 'The generated code is vulnerable to injection attacks due to improper input handling.';
                }
                return 'The generated code contains security vulnerabilities or unsafe practices that need remediation.';
            case 'quality_issue':
                if (errors.some((e) => /type|any/i.test(e))) {
                    return 'The generated code has poor type safety, using "any" types or missing type annotations.';
                }
                return 'The generated code does not meet quality standards: poor naming, missing error handling, or lack of documentation.';
            case 'unknown':
            default:
                if (expected && output) {
                    return `Output does not match expected result. Expected behavior: "${expected.slice(0, 100)}".`;
                }
                return 'The failure could not be classified into a known category. Manual review is recommended.';
        }
    }
    generatePromptImprovements(category, prompt, _output, errors) {
        const improvements = [];
        switch (category) {
            case 'incomplete_specification':
                improvements.push('Add explicit input/output type annotations to the prompt');
                improvements.push('Include concrete examples of expected behavior');
                improvements.push('List all edge cases that must be handled');
                if (prompt.length < 200) {
                    improvements.push('Expand the prompt with more detail - current prompt is too terse');
                }
                break;
            case 'missing_context':
                improvements.push('Include import statements for all referenced modules');
                improvements.push('Add type definitions for external dependencies');
                improvements.push('Provide the project file structure relevant to the task');
                if (errors.some((e) => /module/i.test(e))) {
                    improvements.push('Specify the exact package versions and import paths');
                }
                break;
            case 'wrong_pattern':
                improvements.push('Explicitly state which patterns and APIs to use');
                improvements.push('Include a list of deprecated patterns to avoid');
                improvements.push('Reference architecture documentation or style guides');
                break;
            case 'security_gap':
                improvements.push('Add security requirements: input validation, parameterized queries, output encoding');
                improvements.push('Specify authentication and authorization requirements');
                improvements.push('List OWASP-relevant security checks for this code');
                break;
            case 'quality_issue':
                improvements.push('Require explicit type annotations for all public APIs');
                improvements.push('Add requirement for error handling on all async operations');
                improvements.push('Require JSDoc/docstring comments on public functions');
                break;
            case 'unknown':
            default:
                improvements.push('Add more context and constraints to the prompt');
                improvements.push('Include expected output format and validation criteria');
                improvements.push('Break the task into smaller, more specific sub-tasks');
                break;
        }
        return improvements;
    }
    generateContextAdditions(category, _prompt, _output, errors) {
        const additions = [];
        switch (category) {
            case 'incomplete_specification':
                additions.push('Add function signature with complete parameter and return types');
                additions.push('Include related interface/type definitions');
                additions.push('Add usage examples showing how the function will be called');
                break;
            case 'missing_context':
                additions.push('Include the project tsconfig.json or equivalent configuration');
                additions.push('Add package.json dependencies relevant to the task');
                additions.push('Include sibling file exports that the generated code depends on');
                if (errors.some((e) => /import|module/i.test(e))) {
                    additions.push('Provide a map of module aliases and resolution paths');
                }
                break;
            case 'wrong_pattern':
                additions.push('Include architecture decision records (ADRs) for the project');
                additions.push('Add the project style guide or coding standards document');
                additions.push('Include examples of correct patterns from the existing codebase');
                break;
            case 'security_gap':
                additions.push('Include the project security policy and requirements');
                additions.push('Add relevant OWASP guidelines for the technology stack');
                additions.push('Include existing security middleware or utility functions');
                break;
            case 'quality_issue':
                additions.push('Include ESLint/TSConfig strict mode configuration');
                additions.push('Add examples of well-documented functions from the codebase');
                additions.push('Include the project testing standards and patterns');
                break;
            case 'unknown':
            default:
                additions.push('Add detailed error messages and stack traces');
                additions.push('Include previous successful prompts for similar tasks');
                additions.push('Add the full file content for surrounding context');
                break;
        }
        return additions;
    }
}
