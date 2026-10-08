#!/bin/sh
# usage: build.sh <empty-target-dir>
# main and HEAD share no history, so there is no merge base. Cores must fail with an error that
# tells the user to fetch more history; they must not fall back to the base tip.
set -eu
. "$(dirname "$0")/../lib.sh"
init_repo "$1"
printf 'one\n' > a.txt
commit_all "main root" main-root
git checkout --quiet --orphan unrelated
git rm --quiet -rf .
printf 'two\n' > b.txt
commit_all "unrelated root" head
