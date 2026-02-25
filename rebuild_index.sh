#!/usr/bin/env bash
set -euo pipefail

# start_api.sh
#  - Uses a default SKILLSHUB_API_KEY if none provided
#  - Calls POST /api/skills/index/rebuild and saves the response to /tmp/rebuild_response.json
#  - Prints HTTP status and response body
#  - If sync_failures.json exists in common locations, prints the tail (or last 5 entries via jq)

SKILLSHUB_API_KEY="${SKILLSHUB_API_KEY:-testkey}"
BASE_URL="${BASE_URL:-http://localhost:8002}"
OUT_FILE="/tmp/rebuild_response.json"
HTTP_STATUS_FILE="/tmp/rebuild_response_status.txt"

echo "[start_api.sh] Using BASE_URL=${BASE_URL} SKILLSHUB_API_KEY=${SKILLSHUB_API_KEY}"
echo "NOTE: This script triggers an index rebuild. Ensure the API server is running (use ./start_api_server.sh)."

# Make the POST request. Capture body to OUT_FILE and status code to HTTP_STATUS_FILE
if command -v curl >/dev/null 2>&1; then
  # Allow curl to fail without exiting the script so we can print diagnostics
  set +e
  HTTP_CODE=$(curl -s -X POST "${BASE_URL}/api/skills/index/rebuild" \
    -H "X-API-KEY: ${SKILLSHUB_API_KEY}" \
    -H "Content-Type: application/json" \
    -o "${OUT_FILE}" -w "%{http_code}")
  CURL_EXIT=$?
  set -e
  echo "HTTP_STATUS:${HTTP_CODE} (curl_exit=${CURL_EXIT})" | tee "${HTTP_STATUS_FILE}"
else
  echo "curl not found. Please install curl and re-run." >&2
  exit 2
fi

echo "--- Response body (${OUT_FILE}) ---"
if [ -s "${OUT_FILE}" ]; then
  cat "${OUT_FILE}"
else
  echo "(no response body - ${OUT_FILE} is empty or missing)"
fi

# Look for sync_failures.json in likely locations and show recent entries
for p in ./sync_failures.json ./api/sync_failures.json ./tools/skillshub/sync_failures.json; do
  if [ -f "$p" ]; then
    echo "\nFound failure file: $p"
    if command -v jq >/dev/null 2>&1; then
      echo "Showing last 5 entries (jq):"
      jq '.[-5:]' "$p" || tail -n 200 "$p"
    else
      echo "jq not installed — showing tail 200 lines:" 
      tail -n 200 "$p"
    fi
  fi
done

echo "[start_api.sh] Done."
