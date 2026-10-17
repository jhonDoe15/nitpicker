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
printf '{"manager":"%s","args":[%s],"environment":{"COREPACK_ENABLE_AUTO_PIN":%s,"YARN_IGNORE_PATH":%s}}' \
  "$manager" "$quoted" "$(variable COREPACK_ENABLE_AUTO_PIN)" "$(variable YARN_IGNORE_PATH)" > fake-install-call.json
[ -f fake-no-dependencies.txt ] || mkdir -p node_modules/fake-dependency
if [ -f fake-signal.txt ]; then
  kill -9 $$
fi
if [ -f fake-failure.txt ]; then
  cat fake-failure.txt >&2
  exit 1
fi
if [ -f fake-members.txt ]; then
  while read -r member; do
    [ -n "$member" ] && mkdir -p "$member/node_modules/fake-dependency"
  done < fake-members.txt
fi
