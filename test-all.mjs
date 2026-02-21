#!/usr/bin/env node
/**
 * Smoke test for all Antigravity OS v2.1 MCP servers.
 * Spawns each server, sends MCP initialize + tools/list, verifies tool counts.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import os from "node:os";

const SERVERS = [
  { name: "memory-server", expectedTools: 20, expectedPrompts: 0, needsGit: true },
  { name: "copilot-server", expectedTools: 13, expectedPrompts: 2, needsGit: false },
  { name: "analytics-server", expectedTools: 14, expectedPrompts: 2, needsGit: false },
];

const ROOT = import.meta.dirname;

function sendMessage(proc, message) {
  const json = JSON.stringify(message);
  proc.stdin.write(json + "\n");
}

function readMessages(proc, timeout = 10000) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const messages = [];
    const timer = setTimeout(() => resolve(messages), timeout);

    proc.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      // Try to parse newline-delimited JSON
      const lines = buffer.split("\n");
      buffer = lines.pop(); // keep incomplete last line
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          messages.push(JSON.parse(trimmed));
        } catch {
          // May be Content-Length header or partial data, skip
        }
      }
    });

    proc.on("close", () => {
      clearTimeout(timer);
      // Try to parse remaining buffer
      if (buffer.trim()) {
        try { messages.push(JSON.parse(buffer.trim())); } catch {}
      }
      resolve(messages);
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function testServer(config) {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), `test-${config.name}-`));
  mkdirSync(path.join(tmpDir, ".memory", "snapshots"), { recursive: true });
  mkdirSync(path.join(tmpDir, ".memory", "config"), { recursive: true });
  mkdirSync(path.join(tmpDir, ".memory", "prompts", "templates"), { recursive: true });
  mkdirSync(path.join(tmpDir, ".memory", "prompts", "generated"), { recursive: true });

  if (config.needsGit) {
    execSync("git init -q", { cwd: tmpDir });
    execSync("git config user.email test@test.com && git config user.name Test", { cwd: tmpDir });
  }

  const serverPath = path.join(ROOT, "packages", config.name, "build", "index.js");
  const proc = spawn("node", [serverPath], {
    env: { ...process.env, PROJECT_ROOT: tmpDir, MEMORY_DIR: ".memory" },
    stdio: ["pipe", "pipe", "pipe"],
  });

  // Collect stderr for diagnostics
  let stderr = "";
  proc.stderr.on("data", (d) => { stderr += d.toString(); });

  const messagesPromise = readMessages(proc);

  // Send initialize
  sendMessage(proc, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "smoke-test", version: "1.0" },
    },
  });

  // Wait a bit for init response, then send initialized notification + list tools
  await new Promise((r) => setTimeout(r, 1000));

  sendMessage(proc, {
    jsonrpc: "2.0",
    method: "notifications/initialized",
  });

  sendMessage(proc, {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {},
  });

  if (config.expectedPrompts > 0) {
    sendMessage(proc, {
      jsonrpc: "2.0",
      id: 3,
      method: "prompts/list",
      params: {},
    });
  }

  // Wait for responses
  await new Promise((r) => setTimeout(r, 3000));
  proc.stdin.end();

  const messages = await messagesPromise;

  // Clean up
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}

  // Analyze responses
  const toolsResponse = messages.find((m) => m.id === 2);
  const promptsResponse = messages.find((m) => m.id === 3);
  const initResponse = messages.find((m) => m.id === 1);

  const results = { name: config.name, pass: true, errors: [] };

  if (!initResponse) {
    results.pass = false;
    results.errors.push("No initialize response");
    if (stderr) results.errors.push(`stderr: ${stderr.slice(0, 500)}`);
  }

  if (!toolsResponse || !toolsResponse.result?.tools) {
    results.pass = false;
    results.errors.push("No tools/list response");
  } else {
    const toolCount = toolsResponse.result.tools.length;
    if (toolCount < config.expectedTools) {
      results.pass = false;
      results.errors.push(`Expected >= ${config.expectedTools} tools, got ${toolCount}`);
    }
    results.toolCount = toolCount;
    results.toolNames = toolsResponse.result.tools.map((t) => t.name);
  }

  if (config.expectedPrompts > 0) {
    if (!promptsResponse || !promptsResponse.result?.prompts) {
      results.pass = false;
      results.errors.push("No prompts/list response");
    } else {
      const promptCount = promptsResponse.result.prompts.length;
      if (promptCount < config.expectedPrompts) {
        results.pass = false;
        results.errors.push(`Expected >= ${config.expectedPrompts} prompts, got ${promptCount}`);
      }
      results.promptCount = promptCount;
    }
  }

  return results;
}

// --- Negative Tests ---

/**
 * Test that a tool call with missing required args returns an error.
 */
async function testNegative(serverConfig, testCases) {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), `test-neg-${serverConfig.name}-`));
  mkdirSync(path.join(tmpDir, ".memory", "snapshots"), { recursive: true });
  mkdirSync(path.join(tmpDir, ".memory", "config"), { recursive: true });
  mkdirSync(path.join(tmpDir, ".memory", "prompts", "templates"), { recursive: true });
  mkdirSync(path.join(tmpDir, ".memory", "prompts", "generated"), { recursive: true });

  if (serverConfig.needsGit) {
    execSync("git init -q", { cwd: tmpDir });
    execSync("git config user.email test@test.com && git config user.name Test", { cwd: tmpDir });
  }

  const serverPath = path.join(ROOT, "packages", serverConfig.name, "build", "index.js");
  const proc = spawn("node", [serverPath], {
    env: { ...process.env, PROJECT_ROOT: tmpDir, MEMORY_DIR: ".memory" },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stderr = "";
  proc.stderr.on("data", (d) => { stderr += d.toString(); });

  const messagesPromise = readMessages(proc, 12000);

  // Initialize
  sendMessage(proc, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "neg-test", version: "1.0" },
    },
  });

  await new Promise((r) => setTimeout(r, 1000));
  sendMessage(proc, { jsonrpc: "2.0", method: "notifications/initialized" });

  // Send negative test cases as tool calls
  for (let i = 0; i < testCases.length; i++) {
    sendMessage(proc, {
      jsonrpc: "2.0",
      id: 100 + i,
      method: "tools/call",
      params: testCases[i].params,
    });
  }

  await new Promise((r) => setTimeout(r, 3000));
  proc.stdin.end();

  const messages = await messagesPromise;
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}

  const results = [];
  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    const resp = messages.find((m) => m.id === 100 + i);
    const pass = tc.expectError
      ? Boolean(resp?.result?.isError || resp?.error || (resp?.result?.content?.[0]?.text || "").toLowerCase().includes("error"))
      : Boolean(resp?.result);

    results.push({
      name: tc.name,
      pass,
      detail: pass ? "OK" : `Unexpected response: ${JSON.stringify(resp)?.slice(0, 200)}`,
    });
  }

  return results;
}

const NEGATIVE_TESTS = {
  "analytics-server": [
    {
      name: "log_cost with missing args",
      params: { name: "log_cost", arguments: {} },
      expectError: true,
    },
    {
      name: "check_budget with wrong types",
      params: { name: "check_budget", arguments: { estimated_tokens: "not_a_number", agent: 123 } },
      expectError: true,
    },
    {
      name: "unknown tool name",
      params: { name: "nonexistent_tool", arguments: {} },
      expectError: true,
    },
  ],
  "copilot-server": [
    {
      name: "copilot_execute with missing prompt_file",
      params: { name: "copilot_execute", arguments: { output_file: "test.ts" } },
      expectError: true,
    },
    {
      name: "copilot_validate with missing file",
      params: { name: "copilot_validate", arguments: {} },
      expectError: true,
    },
  ],
  "memory-server": [
    {
      name: "memory_read with invalid key",
      params: { name: "memory_read", arguments: { file: "nonexistent_key" } },
      expectError: true,
    },
    {
      name: "memory_update with missing content",
      params: { name: "memory_update", arguments: { file: "tech_stack", operation: "replace" } },
      expectError: true,
    },
  ],
};

// --- Main ---
async function main() {
  console.log("=== Antigravity OS v2.1 Smoke Tests ===\n");
  console.log("--- Happy Path Tests ---\n");
  let allPass = true;

  for (const config of SERVERS) {
    process.stdout.write(`Testing ${config.name}... `);
    try {
      const result = await testServer(config);
      if (result.pass) {
        console.log(`PASS (${result.toolCount} tools${result.promptCount ? `, ${result.promptCount} prompts` : ""})`);
        if (result.toolNames) {
          console.log(`  Tools: ${result.toolNames.join(", ")}`);
        }
      } else {
        console.log("FAIL");
        result.errors.forEach((e) => console.log(`  ERROR: ${e}`));
        allPass = false;
      }
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      allPass = false;
    }
  }

  console.log(`\n--- Negative Tests (Error Paths) ---\n`);

  for (const config of SERVERS) {
    const cases = NEGATIVE_TESTS[config.name];
    if (!cases?.length) continue;

    process.stdout.write(`Testing ${config.name} errors... `);
    try {
      const results = await testNegative(config, cases);
      const passed = results.filter((r) => r.pass).length;
      const failed = results.filter((r) => !r.pass);
      if (failed.length === 0) {
        console.log(`PASS (${passed}/${results.length} negative cases)`);
      } else {
        console.log(`PARTIAL (${passed}/${results.length})`);
        failed.forEach((f) => console.log(`  FAIL: ${f.name} — ${f.detail}`));
        allPass = false;
      }
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      allPass = false;
    }
  }

  console.log(`\n${allPass ? "ALL TESTS PASSED" : "SOME TESTS FAILED"}`);
  process.exit(allPass ? 0 : 1);
}

main();
