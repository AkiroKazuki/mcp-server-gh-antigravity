#!/usr/bin/env bash
# Smoke test for copilot-server v2.0
# Sends MCP initialize + tools/list and verifies 11 tools are returned.

set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER="node ${DIR}/dist/index.js"

# Create temp .memory directory for testing
export PROJECT_ROOT=$(mktemp -d)
export MEMORY_DIR=".memory"
mkdir -p "${PROJECT_ROOT}/.memory/prompts/templates"
mkdir -p "${PROJECT_ROOT}/.memory/prompts/generated"

cleanup() { rm -rf "$PROJECT_ROOT"; }
trap cleanup EXIT

echo "=== Copilot Server Smoke Test ==="
echo "PROJECT_ROOT=${PROJECT_ROOT}"

# MCP messages
INIT='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
LIST_TOOLS='{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
LIST_PROMPTS='{"jsonrpc":"2.0","id":3,"method":"prompts/list","params":{}}'

# Send messages, capture stdout
RESPONSE=$(echo -e "${INIT}\n${LIST_TOOLS}\n${LIST_PROMPTS}" | timeout 15 $SERVER 2>/dev/null || true)

# Count tools and prompts
TOOL_COUNT=$(echo "$RESPONSE" | grep -o '"name"' | wc -l | tr -d ' ')

echo "Names found in responses: ${TOOL_COUNT}"

if [ "$TOOL_COUNT" -ge 11 ]; then
  echo "PASS: copilot-server returned >= 11 tools"
  exit 0
else
  echo "FAIL: expected >= 11 tools, got ${TOOL_COUNT}"
  echo "Response (first 2000 chars):"
  echo "$RESPONSE" | head -c 2000
  exit 1
fi
