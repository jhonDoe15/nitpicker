#!/bin/sh
manager="$1"
shift
quoted=""
for argument in "$@"; do
  quoted="$quoted${quoted:+,}\"$argument\""
done
printf '{"manager":"%s","args":[%s]}' "$manager" "$quoted" > fake-install-call.json
[ -f fake-no-dependencies.txt ] || mkdir -p node_modules/fake-dependency
if [ -f fake-failure.txt ]; then
  cat fake-failure.txt >&2
  exit 1
fi
if [ -f fake-members.txt ]; then
  while read -r member; do
    [ -n "$member" ] && mkdir -p "$member/node_modules/fake-dependency"
  done < fake-members.txt
fi
