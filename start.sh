#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

cleanup() {
  kill "${backend_pid:-}" "${frontend_pid:-}" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 0' INT TERM

python -m uvicorn backend.server:app --host 127.0.0.1 --port 8000 &
backend_pid=$!
(
  cd frontend
  export HOST=0.0.0.0 PORT=5000 BROWSER=none REACT_APP_BACKEND_URL=""
  exec yarn start
) &
frontend_pid=$!
wait -n "$backend_pid" "$frontend_pid"
