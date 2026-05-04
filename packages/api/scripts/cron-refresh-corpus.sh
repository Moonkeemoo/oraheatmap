#!/usr/bin/env bash
# Weekly corpus refresh — wraps refresh-corpus.ts so cron has a single entry
# point that handles `git pull`, the refresh itself, and the ingestor
# restart needed to activate the new in-memory whale Set.
#
# IMPORTANT — data/* are operational state, NOT pushed back to git from prod.
# The deploy SSH key is read-only by design (compromised server should not be
# able to overwrite the source repo). Instead we use `git update-index
# --skip-worktree` on prod for the two data files so subsequent `git pull`
# never conflicts with the locally-refreshed corpus. Set-up once with:
#   git update-index --skip-worktree data/whale_corpus.json data/whale_aliases.json
# Verify with `git ls-files -v data/whale_*.json` (look for an "S" prefix).
# Local dev gets fresh data by running the refresh script on their own
# machine when needed — this isn't latency-sensitive.
#
# Run by cron as user `ora` on prod. Output streamed to a rotating log
# under ~/oraheatmap/logs/refresh-corpus.log.
#
# Manual invocation:
#   bash ~/oraheatmap/packages/api/scripts/cron-refresh-corpus.sh

set -euo pipefail

REPO=/home/ora/oraheatmap
LOG_DIR=$REPO/logs
LOG=$LOG_DIR/refresh-corpus.log
BUN=/home/ora/.bun/bin/bun

mkdir -p "$LOG_DIR"

{
  echo ""
  echo "================================================================"
  echo "refresh-corpus run @ $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "================================================================"

  cd "$REPO"

  echo "[1/3] git pull (data/* are skip-worktree, won't conflict)"
  git pull --ff-only origin main

  echo "[2/3] refresh-corpus.ts"
  "$BUN" run packages/api/scripts/refresh-corpus.ts

  echo "[3/3] restart ingestor (picks up new corpus into in-memory Set)"
  sudo systemctl restart oraheatmap-api

  echo "done @ $(date -u +%Y-%m-%dT%H:%M:%SZ)"
} >> "$LOG" 2>&1
