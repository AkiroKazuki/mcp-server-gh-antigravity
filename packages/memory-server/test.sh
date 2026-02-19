#!/usr/bin/env bash
# Smoke test for memory-server v2.0
# Sends MCP initialize + tools/list and verifies 18 tools are returned.

set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER="node ${DIR}/dist/index.js"

# Create temp .memory directory for testing
export PROJECT_ROOT=$(mktemp -d)
export MEMORY_DIR=".memory"
mkdir -p "${PROJECT_ROOT}/.memory"
cd "${PROJECT_ROOT}" && git init -q && cd - > /dev/null

cleanup() { rm -rf "$PROJECT_ROOT"; }
trap cleanup EXIT

echo "=== Memory Server Smoke Test ==="
echo "PROJECT_ROOT=${PROJECT_ROOT}"

# MCP messages (JSON-RPC over stdio)
INIT='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
LIST_TOOLS='{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'

# Send both messages separated by newlines, capture stdout
RESPONSE=$(echo -e "${INIT}\n${LIST_TOOLS}" | timeout 15 $SERVER 2>/dev/null || true)

# Count tool names in response
TOOL_COUNT=$(echo "$RESPONSE" | grep -o '"name"' | wc -l | tr -d ' ')

echo "Tools found: ${TOOL_COUNT}"

if [ "$TOOL_COUNT" -ge 18 ]; then
  echo "PASS: memory-server returned >= 18 tools"
  exit 0
else
  echo "FAIL: expected >= 18 tools, got ${TOOL_COUNT}"
  echo "Response (first 2000 chars):"
  echo "$RESPONSE" | head -c 2000
  exit 1
fi
