#!/usr/bin/env bash
# Weekly corpus refresh — wraps refresh-corpus.ts so cron has a single entry
# point that handles git pull, the refresh itself, commit-and-push of any
# changed data files, and the ingestor restart needed to activate the new
# in-memory whale Set.
#
# Idempotent: if Polymarket's leaderboard hasn't moved at all, no commit and
# no restart happens.
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

  echo "[1/5] git pull"
  git pull --ff-only origin main

  echo "[2/5] refresh-corpus.ts"
  "$BUN" run packages/api/scripts/refresh-corpus.ts

  echo "[3/5] git status on data/"
  if git diff --quiet -- data/whale_corpus.json data/whale_aliases.json; then
    echo "  no changes — leaderboard stable since last run, nothing to commit"
    echo "[4/5] skipping commit + push"
  else
    echo "[4/5] commit + push"
    git add data/whale_corpus.json data/whale_aliases.json
    git -c user.email="cron@oralab.xyz" -c user.name="oralab-cron" \
        commit -m "data(whales): weekly corpus refresh $(date -u +%Y-%m-%d)"
    git push origin main
  fi

  echo "[5/5] restart ingestor (picks up new corpus into in-memory Set)"
  sudo systemctl restart oraheatmap-api

  echo "done @ $(date -u +%Y-%m-%dT%H:%M:%SZ)"
} >> "$LOG" 2>&1
