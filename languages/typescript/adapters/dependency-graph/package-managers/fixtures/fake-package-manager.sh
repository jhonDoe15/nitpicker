#!/bin/sh
manager="$1"
shift
quoted=""
for argument in "$@"; do
  quoted="$quoted${quoted:+,}\"$argument\""
done
variable() {
  eval "value=\${$1-__unset__}"
  if [ "$value" = "__unset__" ]; then printf 'null'; else printf '"%s"' "$value"; fi
}
printf '{"manager":"%s","args":[%s],"environment":{"COREPACK_ENABLE_DOWNLOAD_PROMPT":%s,"YARN_ENABLE_SCRIPTS":%s,"YARN_NODE_LINKER":%s}}' \
  "$manager" "$quoted" "$(variable COREPACK_ENABLE_DOWNLOAD_PROMPT)" "$(variable YARN_ENABLE_SCRIPTS)" "$(variable YARN_NODE_LINKER)" > fake-install-call.json
mkdir -p node_modules/fake-dependency
if [ -f fake-failure.txt ]; then
  cat fake-failure.txt >&2
  exit 1
fi
if [ -f fake-members.txt ]; then
  while read -r member; do
    [ -n "$member" ] && mkdir -p "$member/node_modules/fake-dependency"
  done < fake-members.txt
fi
