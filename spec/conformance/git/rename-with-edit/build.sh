#!/bin/sh
# usage: build.sh <empty-target-dir>
# main: src/old.js. Branch `feature`: renames it to src/new.js with a small edit (still a rename
# at git's default 50% similarity). Tags: base = main tip, head = feature tip.
set -eu
. "$(dirname "$0")/../lib.sh"
init_repo "$1"
mkdir src
printf 'export function greet(name) {\n  return "hello " + name;\n}\nexport const one = 1;\nexport const two = 2;\n' > src/old.js
commit_all "add old.js" base
git checkout --quiet -b feature
git mv src/old.js src/new.js
printf 'export const three = 3;\n' >> src/new.js
commit_all "rename old.js to new.js" head
