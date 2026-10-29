#!/usr/bin/env bash
# Smoke-tests a nitpicker image on the sample project of each named case (cases/<name>/case.sh):
#   run.sh <image> <case>...
# The sample is copied to a temporary repository, prepared inside the image the way a user would,
# then gated twice against main: a harmless change must exit 0 with no new enforceable finding, and
# a change with a known violation must exit 1 and report it. DOCKER_RUN_ARGS adds arguments to every
# docker run (for example --network host behind a proxy). KEEP_SMOKE=1 keeps the temporary files,
# and SMOKE_HOME=<directory> keeps the package managers' caches between runs.
set -euo pipefail

image=${1:?usage: run.sh <image> <case>...}
shift
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo=$(cd "$here/../.." && pwd)
read -r -a docker_args <<<"${DOCKER_RUN_ARGS:-}"

fail() {
  echo "::error::$*"
  exit 1
}

container() {
  docker run --rm --user "$(id -u):$(id -g)" -v "$work:/work" -v "$home:/home/nitpicker" \
    "${docker_args[@]}" "$@"
}

repository() {
  git -C "$work" -c user.name=smoke -c user.email=smoke@example.com "$@"
}

overlay() {
  cp -R "$here/cases/$overlays/$1/." "$work/"
}

commit_change() {
  local branch=$1
  repository switch -q -c "$branch" main
  "$branch"
  repository add -A
  repository commit -q -m "$branch"
}

gate() {
  local branch=$1 expected=$2 code=0
  repository switch -q "$branch"
  container "$image" --base main --output "reports/$branch" || code=$?
  [ "$code" -eq "$expected" ] || fail "$case: the $branch change exited $code, expected $expected"
}

reports_violation() {
  node -e '
    const [file, pattern] = process.argv.slice(1);
    const findings = JSON.parse(require("node:fs").readFileSync(file, "utf8"));
    const found = findings.some(
      (finding) =>
        finding.classification === "enforceable" &&
        new RegExp(pattern).test(`${finding.tool}/${finding.rule}`),
    );
    process.exit(found ? 0 : 1);
  ' "$work/reports/violation/new-findings.json" "$VIOLATION_RULE"
}

smoke_case() {
  case=$1
  unset OVERLAYS PRESET
  prepare() { :; }
  clean() { overlay clean; }
  violation() { overlay violation; }
  SETUP=true
  # shellcheck disable=SC1090
  . "$here/cases/$case/case.sh"
  overlays=${OVERLAYS:-$case}
  work=$(mktemp -d)
  home=${SMOKE_HOME:-$(mktemp -d)}
  if [ -z "${KEEP_SMOKE:-}" ]; then
    trap 'rm -rf "$work"; [ -n "${SMOKE_HOME:-}" ] || rm -rf "$home"' RETURN
  fi
  echo "::group::$case on $image"
  cp -R "$repo/$SAMPLE/." "$work/"
  prepare
  [ -z "${PRESET:-}" ] || printf '{"preset": "%s"}\n' "$PRESET" >"$work/nitpicker.config.json"
  printf '%s\n' node_modules/ reports/ build/ target/ .gradle/ .kotlin/ .venv/ '.nitpicker-*/' __pycache__/ \
    >>"$work/.gitignore"
  container --entrypoint sh "$image" -c "$SETUP"
  repository init -q -b main
  repository add -A
  repository commit -q -m base
  commit_change clean
  repository switch -q main
  commit_change violation
  gate clean 0
  gate violation 1
  reports_violation || fail "$case: the violation change did not report $VIOLATION_RULE"
  echo "::endgroup::"
}

usage=$(docker run --rm "${docker_args[@]}" "$image" --help)
grep -q '^Usage: nitpicker' <<<"$usage" || fail "$image --help did not print the usage"
for name in "$@"; do
  smoke_case "$name"
done
