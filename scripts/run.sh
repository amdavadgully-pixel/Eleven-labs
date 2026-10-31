#!/usr/bin/env bash
# One-command local start: venv + deps + models + server.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -d .venv ] || python3 -m venv .venv
. .venv/bin/activate
pip install -q -r requirements.txt
./scripts/download_models.sh
exec uvicorn server.app:app --host "${HOST:-127.0.0.1}" --port "${PORT:-8000}"
