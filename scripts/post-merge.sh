#!/usr/bin/env bash
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

echo "Instalando dependencias del backend..."
python -m pip install --disable-pip-version-check --no-input -r backend/requirements.txt
python -m py_compile backend/server.py

echo "Instalando dependencias y compilando el frontend..."
(
  cd frontend
  yarn install --frozen-lockfile --non-interactive
  yarn build
)
