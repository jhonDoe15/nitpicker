#!/bin/bash
# run.sh : compiles each folder of tests/fixtures/javac with javac 21 and writes the names it made to
# tests/expected/javac.json.
set -e
here="$(cd "$(dirname "$0")" && pwd)"; tests="$here/../../tests"; work="$(mktemp -d)"
{
  echo '['
  first=1
  for case in "$tests"/fixtures/javac/*/; do
    name="$(basename "$case")"; mkdir -p "$work/$name"
    find "$case" -name '*.java' > "$work/$name.sources"
    javac -nowarn -g -parameters -d "$work/$name" @"$work/$name.sources"
    rows="$(python3 "$here/names.py" "$work/$name" --json "$name/" | sed '1d;$d')"
    [ -n "$rows" ] && { [ $first = 1 ] || echo ','; first=0; echo -n "$rows"; }
  done
  echo; echo ']'
} > "$tests/expected/javac.json"
rm -rf "$work"
