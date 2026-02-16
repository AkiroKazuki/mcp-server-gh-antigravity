/**
 * Antigravity OS v2.0 - Validator
 * Security, quality, and trading validation for Copilot output.
 * Also includes CLI output cleaning (replaces cli-cleaner.ts).
 */

import type { ValidationIssue, ValidationResult } from './types.js';

interface SecurityPattern {
  pattern: RegExp;
  message: string;
  severity: 'critical' | 'warning';
}

interface QualityPattern {
  pattern: RegExp;
  message: string;
  severity: 'warning' | 'info';
}

interface TradingPattern {
  pattern: RegExp;
  message: string;
  severity: 'critical' | 'warning';
}

export class Validator {
  private securityPatterns: SecurityPattern[];
  private qualityPatterns: QualityPattern[];
  private tradingPatterns: TradingPattern[];

  constructor() {
    this.securityPatterns = [
      { pattern: /\beval\s*\(/, message: 'Dangerous eval() usage detected', severity: 'critical' },
      { pattern: /\bexec\s*\(/, message: 'Dangerous exec() usage detected', severity: 'critical' },
      { pattern: /rm\s+-rf\s+\//, message: 'Destructive rm -rf with root path', severity: 'critical' },
      { pattern: /\bsudo\b/, message: 'Sudo usage detected - requires elevated privileges', severity: 'warning' },
      { pattern: /chmod\s+777/, message: 'Insecure chmod 777 permissions', severity: 'critical' },
      { pattern: /curl\s+.*\|\s*bash/, message: 'Piping curl to bash is unsafe', severity: 'critical' },
      { pattern: /\b(process\.env|ENV)\b.*\b(password|passwd|secret|token|api_key|apikey)\b/i, message: 'Potential environment variable credential exposure', severity: 'warning' },
      { pattern: /(password|passwd|secret|token|api_key|apikey)\s*[:=]\s*['"][^'"]+['"]/i, message: 'Hardcoded credential detected', severity: 'critical' },
      { pattern: /SELECT\s+.*FROM\s+.*WHERE\s+.*['"]\s*\+/i, message: 'Potential SQL injection via string concatenation', severity: 'critical' },
      { pattern: /<script[\s>]/i, message: 'Potential XSS via script tag', severity: 'critical' },
      { pattern: /[`'"].*;.*[`'"]\s*\+|[`'"]\s*\+.*[`'"].*;/, message: 'Potential command injection in string', severity: 'warning' },
      { pattern: /&&\s*['"]|['"]\s*&&/, message: 'Potential command injection via && in string', severity: 'warning' },
      { pattern: /\.\.\/(\.\.\/)+/, message: 'Path traversal pattern detected', severity: 'warning' },
      { pattern: /\b(pickle\.loads?|yaml\.load\s*\((?!.*Loader))\b/, message: 'Unsafe deserialization detected', severity: 'critical' },
      { pattern: /\b(window\.location|document\.location)\s*=\s*[^;]*\b(req|params|query|input|user)/i, message: 'Potential unvalidated redirect', severity: 'warning' },
      { pattern: /innerHTML\s*=/, message: 'Potential XSS via innerHTML assignment', severity: 'warning' },
      { pattern: /dangerouslySetInnerHTML/, message: 'React XSS risk via dangerouslySetInnerHTML', severity: 'warning' },
    ];

    this.qualityPatterns = [
      { pattern: /\bconsole\.log\s*\(/, message: 'console.log detected (use console.error or a logger)', severity: 'warning' },
      { pattern: /\b(TODO|FIXME|HACK|XXX)\b/, message: 'Unresolved TODO/FIXME marker', severity: 'info' },
      { pattern: /catch\s*\(\s*\w*\s*\)\s*\{\s*\}/, message: 'Empty catch block swallows errors', severity: 'warning' },
      { pattern: /:\s*any\b/, message: 'Usage of "any" type reduces type safety', severity: 'info' },
      { pattern: /(?<!\w)(0x[0-9a-fA-F]{4,}|\b(?:[2-9]\d{2,}|1\d{3,})\b)(?!\w)(?!.*(?:port|status|timeout|size|length|width|height|max|min|limit|code|version|year|http|rgb|0x))/, message: 'Magic number detected - consider using a named constant', severity: 'info' },
    ];

    this.tradingPatterns = [
      { pattern: /position[_\s]?size(?!.*stop[_\s]?loss)/i, message: 'Position sizing without stop loss reference', severity: 'critical' },
      { pattern: /leverage\s*[:=>\s]+\s*(\d{2,})/i, message: 'High leverage detected (>10x) - extreme risk', severity: 'critical' },
      { pattern: /(?:order|trade|execute)(?!.*(?:risk[_\s]?manage|stop[_\s]?loss|max[_\s]?loss|risk[_\s]?limit))/i, message: 'Trading operation without apparent risk management', severity: 'warning' },
      { pattern: /\b(future|tomorrow|next[_\s]?day|forward[_\s]?looking)\b.*\b(price|data|value|close|open)\b/i, message: 'Potential lookahead bias - accessing future data', severity: 'critical' },
    ];
  }

  validate(content: string, requirements?: string[]): ValidationResult {
    const issues: ValidationIssue[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      for (const sec of this.securityPatterns) {
        if (sec.pattern.test(line)) {
          issues.push({
            type: 'security',
            severity: sec.severity,
            message: sec.message,
            pattern: sec.pattern.source,
            line: i + 1,
          });
        }
      }

      for (const qual of this.qualityPatterns) {
        if (qual.pattern.test(line)) {
          issues.push({
            type: 'quality',
            severity: qual.severity,
            message: qual.message,
            pattern: qual.pattern.source,
            line: i + 1,
          });
        }
      }

      for (const trd of this.tradingPatterns) {
        if (trd.pattern.test(line)) {
          issues.push({
            type: 'trading',
            severity: trd.severity,
            message: trd.message,
            pattern: trd.pattern.source,
            line: i + 1,
          });
        }
      }
    }

    // Check requirements if provided
    if (requirements && requirements.length > 0) {
      const contentLower = content.toLowerCase();
      for (const req of requirements) {
        const reqLower = req.toLowerCase();
        const terms = reqLower.split(/\s+/).filter((t) => t.length > 3);
        const found = terms.some((t) => contentLower.includes(t));
        if (!found) {
          issues.push({
            type: 'quality',
            severity: 'warning',
            message: `Requirement may not be met: "${req}"`,
            pattern: 'requirement_check',
          });
        }
      }
    }

    const criticalSecurityCount = issues.filter(
      (i) => i.type === 'security' && i.severity === 'critical'
    ).length;
    const warningSecurityCount = issues.filter(
      (i) => i.type === 'security' && i.severity === 'warning'
    ).length;
    const qualityWarningCount = issues.filter(
      (i) => i.type === 'quality' && i.severity === 'warning'
    ).length;
    const qualityInfoCount = issues.filter(
      (i) => i.type === 'quality' && i.severity === 'info'
    ).length;

    const securityScore = Math.max(
      0,
      100 - criticalSecurityCount * 25 - warningSecurityCount * 10
    );
    const qualityScore = Math.max(
      0,
      100 - qualityWarningCount * 10 - qualityInfoCount * 5
    );

    const hasCritical = issues.some((i) => i.severity === 'critical');

    return {
      valid: !hasCritical,
      issues,
      cleaned_content: this.stripCliJunk(content),
      security_score: securityScore,
      quality_score: qualityScore,
    };
  }

  stripCliJunk(output: string): string {
    const junkPatterns: RegExp[] = [
      // ANSI escape codes
      /\x1b\[[0-9;]*[a-zA-Z]/g,
      // Spinner characters
      /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⣾⣽⣻⢿⡿⣟⣯⣷◐◓◑◒⊙◉○●]/g,
      // Progress bars
      /\[([#=\->.\s]){3,}\]\s*\d*%?/g,
      // "Analyzing your question..." type lines
      /^(Analyzing|Thinking|Scanning|Processing|Loading|Searching|Generating|Compiling).*\.{2,}\s*$/gm,
      // GitHub Copilot prefixes
      /^GitHub Copilot:\s*/gm,
      /^Here is your code:\s*/gm,
      /^Here's the .*:\s*/gm,
      // Generated-by comments
      /^\/\/\s*Generated by .*$/gm,
      /^#\s*Generated by .*$/gm,
      // Markdown code fences (opening/closing)
      /^```[a-z]*\n/g,
      /\n```\s*$/g,
      // Multiple consecutive blank lines (collapse to single)
      /\n{3,}/g,
    ];

    let cleaned = output;
    for (const pattern of junkPatterns) {
      cleaned = cleaned.replace(pattern, pattern.source.includes('\\n{3,}') ? '\n\n' : '');
    }

    return cleaned.trim();
  }
}
