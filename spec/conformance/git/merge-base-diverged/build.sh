#!/bin/sh
# usage: build.sh <empty-target-dir>
#   fork-point --- main-tip         (main advanced after the fork)
#        \--- head                  (feature, checked out)
# The merge base of main and HEAD is the fork point, not main's tip: changes that landed on main
# after the fork must not count as resolved findings.
set -eu
. "$(dirname "$0")/../lib.sh"
init_repo "$1"
printf 'one\n' > a.txt
commit_all "root" fork-point
git checkout --quiet -b feature
printf 'feature\n' > f.txt
commit_all "feature work" head
git checkout --quiet main
printf 'main moved on\n' > m.txt
commit_all "main advances" main-tip
git checkout --quiet feature
