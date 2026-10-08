# Shared helpers for the conformance repository scripts. Sourced, not executed.
# Deterministic commits: fixed identity and dates, no signing, no global config.
export GIT_AUTHOR_NAME=conformance GIT_AUTHOR_EMAIL=conformance@example.invalid
export GIT_COMMITTER_NAME=conformance GIT_COMMITTER_EMAIL=conformance@example.invalid
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null
tick=1700000000

init_repo() {
  mkdir -p "$1"
  cd "$1" || exit 1
  git init --quiet --initial-branch=main
  git config commit.gpgsign false
}

# commit_all <message> <tag>: stage everything, commit with the next fixed date, tag it.
commit_all() {
  tick=$((tick + 60))
  git add --all
  GIT_AUTHOR_DATE="$tick +0000" GIT_COMMITTER_DATE="$tick +0000" git commit --quiet -m "$1"
  git tag "$2"
}
