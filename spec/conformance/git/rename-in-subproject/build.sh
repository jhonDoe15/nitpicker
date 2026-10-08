#!/bin/sh
# usage: build.sh <empty-target-dir>
# Monorepo: the analyzed project is packages/app. A file inside it is renamed and so is a file
# outside it; only the in-project rename is reported, relative to the project directory.
set -eu
. "$(dirname "$0")/../lib.sh"
init_repo "$1"
mkdir -p packages/app/src packages/lib
printf 'export const value = 1;\nexport const other = 2;\nexport const more = 3;\n' > packages/app/src/a.js
printf 'export const lib1 = 1;\nexport const lib2 = 2;\nexport const lib3 = 3;\n' > packages/lib/x.js
commit_all "add files" base
git checkout --quiet -b feature
git mv packages/app/src/a.js packages/app/src/b.js
git mv packages/lib/x.js packages/lib/y.js
commit_all "rename files" head
