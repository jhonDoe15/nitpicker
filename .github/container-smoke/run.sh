#!/usr/bin/env bash
# Smoke-tests a nitpicker image on the sample project of each named case (cases/<name>/case.sh):
#   run.sh <image> <case>[@<user>]...
# The sample is copied to a temporary repository, prepared inside the image the way a user would,
# then gated twice against main: a harmless change must exit 0 with no new enforceable finding, and
# a change with a known violation must exit 1 and report it.
# By default the containers run as the host user with a temporary home directory mounted, as the
# docs show. <case>@root runs them as root, and <case>@<uid>:<gid> as a user with no passwd entry;
# both without a home mount, so they use the image's own home directory.
# DOCKER_RUN_ARGS adds arguments to every docker run (for example --network host behind a proxy).
# KEEP_SMOKE=1 keeps the temporary files, and SMOKE_HOME=<directory> keeps the package managers'
# caches between runs of the default user.
set -euo pipefail

image=${1:?usage: run.sh <image> <case>[@<user>]...}
shift
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo=$(cd "$here/../.." && pwd)
read -r -a docker_args <<<"${DOCKER_RUN_ARGS:-}"
directories=()
volumes=()

fail() {
  echo "::error::$*"
  exit 1
}

# Files the containers created may belong to another user, so a container removes what the host
# cannot.
clean_up() {
  [ -z "${KEEP_SMOKE:-}" ] || return 0
  local directory volume
  for directory in ${directories[@]+"${directories[@]}"}; do
    rm -rf "$directory" 2>/dev/null ||
      docker run --rm --user 0:0 -v "$directory:/clean" --entrypoint find "$image" /clean -mindepth 1 -delete
    rm -rf "$directory"
  done
  for volume in ${volumes[@]+"${volumes[@]}"}; do
    docker volume rm -f "$volume" >/dev/null
  done
}
trap clean_up EXIT

# Sets $created to a new temporary directory that the exit trap removes.
temporary_directory() {
  created=$(mktemp -d)
  directories+=("$created")
}

# Runs a shell command in the image as the case's user. Another user than the host's needs write
# access to the checkout, and the files it creates stay writable for the host's git.
in_image() {
  local script=$1
  shift
  local run_as=(--user "$(id -u):$(id -g)" -v "$home:/home/nitpicker")
  if [ -n "$user" ]; then
    run_as=(--user "$user")
    chmod -R a+rwX "$work"
    script="umask 0; $script"
  fi
  [ -z "$volume" ] || run_as+=(-v "$volume:$VOLUME_AT")
  docker run --rm "${run_as[@]}" -v "$work:/work" ${docker_args[@]+"${docker_args[@]}"} \
    --entrypoint sh "$image" -c "$script" sh "$@"
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
  in_image 'exec nitpicker "$@"' --base main --output "reports/$branch" || code=$?
  [ "$code" -eq "$expected" ] || fail "$label: the $branch change exited $code, expected $expected"
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

# A case sets SAMPLE, VIOLATION_RULE and optionally PRESET (written to nitpicker.config.json),
# SETUP (run in the image before the first commit), OVERLAYS (the case whose clean/ and violation/
# directories it uses), VOLUME_AT (a directory of the image kept in a volume for the whole case)
# and the functions prepare, clean and violation.
smoke_case() {
  label=$1
  local case_name=${label%@*}
  user=
  [[ "$label" != *@* ]] || user=${label#*@}
  unset OVERLAYS PRESET VOLUME_AT
  prepare() { :; }
  clean() { overlay clean; }
  violation() { overlay violation; }
  SETUP=true
  # shellcheck disable=SC1090
  . "$here/cases/$case_name/case.sh"
  overlays=${OVERLAYS:-$case_name}
  temporary_directory
  work=$created
  home=${SMOKE_HOME:-}
  if [ -z "$home" ]; then
    temporary_directory
    home=$created
  fi
  volume=
  if [ -n "${VOLUME_AT:-}" ]; then
    volume=$(docker volume create)
    volumes+=("$volume")
  fi
  echo "::group::$label on $image"
  cp -R "$repo/$SAMPLE/." "$work/"
  prepare
  [ -z "${PRESET:-}" ] || printf '{"preset": "%s"}\n' "$PRESET" >"$work/nitpicker.config.json"
  printf '%s\n' node_modules/ reports/ build/ target/ .gradle/ .kotlin/ .venv/ '.nitpicker-*/' __pycache__/ \
    >>"$work/.gitignore"
  in_image "$SETUP"
  repository init -q -b main
  repository add -A
  repository commit -q -m base
  commit_change clean
  repository switch -q main
  commit_change violation
  gate clean 0
  gate violation 1
  reports_violation || fail "$label: the violation change did not report $VIOLATION_RULE"
  echo "::endgroup::"
}

usage=$(docker run --rm ${docker_args[@]+"${docker_args[@]}"} "$image" --help)
grep -q '^Usage: nitpicker' <<<"$usage" || fail "$image --help did not print the usage"
for name in "$@"; do
  smoke_case "$name"
done
