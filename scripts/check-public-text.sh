#!/usr/bin/env bash
set -euo pipefail

workspace_pattern='claude\.ai/(code/session_|artifact/)|^Claude-Session:|/mnt/project-files|\b(cmsg|chan|cse)_[A-Za-z0-9]{8,}'
attribution_pattern='^<!-- claude-projects-attribution[^>]*-->$|^_Requested by \*\*[^*]+\*\* · \[project thread\]\(https://claude\.ai/code/project/[^)]+\)_$'

failed=0

check() {
  local label=$1 text=$2 lines
  text=$(printf '%s\n' "$text" | tr -d '\r' | grep -vE "$attribution_pattern" || true)
  lines=$(printf '%s\n' "$text" | grep -nE "$workspace_pattern" || true)
  if [ -n "$lines" ]; then
    echo "::error::$label contains a private workspace link, id or path:"
    printf '%s\n' "$lines"
    failed=1
  fi
  if [ -n "${DENYLIST:-}" ] && printf '%s\n' "$text" | grep -qiE "$DENYLIST"; then
    echo "::error::$label contains a term from the private denylist (not shown here)."
    failed=1
  fi
}

check "PR title" "${PR_TITLE:-}"
check "PR description" "${PR_BODY:-}"

for sha in $(git rev-list "${BASE_SHA}..${HEAD_SHA}"); do
  check "Commit ${sha:0:8} message" "$(git log -1 --format=%B "$sha")"
done

if [ "$failed" -ne 0 ]; then
  echo "Remove these from the text, or reword the commits, and push again."
  exit 1
fi
echo "PR text and commit messages are clean."
