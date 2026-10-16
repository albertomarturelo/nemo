#!/usr/bin/env bash
# SessionStart hook: make orientation automatic instead of remembered.
#
# Injects the /session-start pair (CURRENT_STATUS + decisions index) into the
# agent's context — stdout from a SessionStart hook is added to it — plus a
# staleness warning when the code has moved past the last status update.
#
# CURRENT_STATUS.md is gitignored here (per-clone working state), so freshness
# is the file's mtime, not git history. Claude Code only; the skill stays the
# portable source of truth (ADR adopt-cfd-upstream-revisions).
set -uo pipefail

[ -f docs/CURRENT_STATUS.md ] || {
  echo "docs/CURRENT_STATUS.md is missing (gitignored, per-clone). Run /session-start to bootstrap it."
  exit 0
}

echo "=== docs/CURRENT_STATUS.md (auto-injected at session start) ==="
cat docs/CURRENT_STATUS.md
echo ""

if [ -f docs/decisions/_index.md ]; then
  echo "=== docs/decisions/_index.md ==="
  cat docs/decisions/_index.md
  echo ""
fi

# Warn if the newest commit is more than a day newer than the status file.
if git rev-parse --git-dir >/dev/null 2>&1; then
  if git ls-files --error-unmatch docs/CURRENT_STATUS.md >/dev/null 2>&1; then
    last_status=$(git log -1 --format=%ct -- docs/CURRENT_STATUS.md 2>/dev/null)
  else
    last_status=$(stat -f %m docs/CURRENT_STATUS.md 2>/dev/null \
      || stat -c %Y docs/CURRENT_STATUS.md 2>/dev/null)
  fi
  last_commit=$(git log -1 --format=%ct 2>/dev/null)
  if [ -n "${last_commit:-}" ] && [ "${last_commit:-0}" -gt $(( ${last_status:-0} + 86400 )) ]; then
    echo "WARNING — CONTEXT MAY BE STALE: the newest commit is more than a day"
    echo "newer than the last docs/CURRENT_STATUS.md update. Verify its claims"
    echo "against 'git log' before trusting them, and flag the drift to the user."
  fi
fi

exit 0
