/**
 * Antigravity OS v2.0 - Shared Prompt Definitions
 * Single source of truth for prompts shared across servers.
 */

export const EFFICIENCY_RULES = [
  "# Antigravity OS Efficiency Rules",
  "",
  "1. **Check memory before starting** — Always read active context and relevant lessons",
  "2. **Log decisions immediately** — Use memory_log_decision for all architecture choices",
  "3. **Log lessons as they happen** — Use memory_log_lesson for bugs, patterns, anti-patterns",
  "4. **Validate before merging** — Use copilot_validate before accepting any generated code",
  "5. **Monitor costs** — Check budget before expensive operations",
  "6. **Use skill files** — Build reusable prompt templates, don't repeat specifications",
  "7. **Detect loops** — If a task fails 3 times, stop and analyze with analyze_failure",
  "8. **Batch when possible** — Use copilot_batch_execute for related tasks",
  "9. **Cache responses** — Reuse validated results to avoid regeneration costs",
  "10. **Review health** — Periodically run memory_health_report and system_health",
].join("\n");

export function getEfficiencyRulesPrompt() {
  return {
    description: "Core Antigravity OS efficiency rules",
    messages: [{
      role: "user" as const,
      content: {
        type: "text" as const,
        text: EFFICIENCY_RULES,
      },
    }],
  };
}
