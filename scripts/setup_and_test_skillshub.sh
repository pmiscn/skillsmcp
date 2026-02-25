#!/usr/bin/env bash
set -euo pipefail

# setup_and_test_skillshub.sh
# Creates a fresh venv, optionally downloads wheels, installs requirements,
# runs tests, and collects logs under ~/skillshub_logs.

REPO_DIR="$HOME/projects/skillsmcp"
LOG_DIR="$HOME/skillshub_logs"

mkdir -p "$LOG_DIR"

echo "1) Repo listing" | tee "$LOG_DIR/summary.txt"
ls -la "$REPO_DIR" > "$LOG_DIR/ls_root.txt" 2>&1 || true
echo "" >> "$LOG_DIR/summary.txt"
echo "tools/skillshub contents:" >> "$LOG_DIR/summary.txt"
ls -la "$REPO_DIR/tools/skillshub" > "$LOG_DIR/ls_skillshub.txt" 2>&1 || true

echo "2) Remove existing .venv (if any)" | tee -a "$LOG_DIR/summary.txt"
if [ -d "$REPO_DIR/.venv" ]; then
  rm -rf "$REPO_DIR/.venv"
  echo "removed existing .venv" >> "$LOG_DIR/summary.txt"
fi

echo "3) Create virtualenv and activate" | tee -a "$LOG_DIR/summary.txt"
python3 -m venv "$REPO_DIR/.venv"
# shellcheck disable=SC1090
. "$REPO_DIR/.venv/bin/activate"

echo "4) Upgrade pip/setuptools/wheel" | tee -a "$LOG_DIR/summary.txt"
python -m pip install --upgrade pip setuptools wheel 2>&1 | tee "$LOG_DIR/pip_upgrade.log"

echo "5) Optional: pre-download wheels to /tmp/skillwheels (skip with SKIP_WHEEL_DOWNLOAD=1)" | tee -a "$LOG_DIR/summary.txt"
if [ "${SKIP_WHEEL_DOWNLOAD:-0}" != "1" ]; then
  echo "Downloading wheels to /tmp/skillwheels (may take time)" | tee -a "$LOG_DIR/summary.txt"
  mkdir -p /tmp/skillwheels
  pip download -r "$REPO_DIR/tools/skillshub/requirements.txt" -d /tmp/skillwheels 2>&1 | tee "$LOG_DIR/pip_download.log" || true
  if [ "$(ls -A /tmp/skillwheels 2>/dev/null || true)" != "" ]; then
    echo "Installing from wheels with --no-index" | tee -a "$LOG_DIR/summary.txt"
    pip install --no-index --find-links /tmp/skillwheels -r "$REPO_DIR/tools/skillshub/requirements.txt" 2>&1 | tee "$LOG_DIR/pip_install.log" || true
  else
    echo "No wheels downloaded; will install from PyPI" | tee -a "$LOG_DIR/summary.txt"
  fi
else
  echo "SKIP_WHEEL_DOWNLOAD=1 set; skipping wheel download" | tee -a "$LOG_DIR/summary.txt"
fi

if [ ! -f "$LOG_DIR/pip_install.log" ]; then
  echo "6) Installing directly from PyPI (may be large)" | tee -a "$LOG_DIR/summary.txt"
  pip install -r "$REPO_DIR/tools/skillshub/requirements.txt" 2>&1 | tee "$LOG_DIR/pip_install.log" || true
fi

python -m pip freeze > "$LOG_DIR/pip_freeze.txt" || true

echo "7) Running pytest for tools/skillshub/tests" | tee -a "$LOG_DIR/summary.txt"
pytest -q "$REPO_DIR/tools/skillshub/tests" 2>&1 | tee "$LOG_DIR/pytest.log" || true

echo "Done. Collected logs in $LOG_DIR" | tee -a "$LOG_DIR/summary.txt"

chmod -R a+r "$LOG_DIR" || true
