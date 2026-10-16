#!/bin/sh
node=$1
script=$2
tool=$3
shift 3

slow() {
  exec "$node" "$script" "$tool" "$@"
}

first_line() {
  grep -m1 . "$1" 2>/dev/null
}

value_of() {
  flag=$1
  shift
  while [ $# -gt 1 ]; do
    if [ "$1" = "$flag" ]; then
      printf '%s' "$2"
      return
    fi
    shift
  done
}

copy_or() {
  if [ -e "$1" ]; then
    cat "$1" > "$2"
  else
    printf '%s' "$3" > "$2"
  fi
}

json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

sarif() {
  cwd=$(pwd -P)
  printf '{"runs":[{"tool":{"driver":{"name":"ruff"}},"results":['
  index=0
  if [ -e violations.txt ]; then
    while IFS='|' read -r rule file message _ || [ -n "$rule" ]; do
      [ -n "$rule$file$message" ] || continue
      [ "$index" -eq 0 ] || printf ','
      index=$((index + 1))
      printf '{"ruleId":"%s","level":"error","message":{"text":"%s"},' "$(json_escape "$rule")" "$(json_escape "$message")"
      printf '"locations":[{"physicalLocation":{"artifactLocation":{"uri":"file://%s"},' "$(json_escape "$cwd/$file")"
      printf '"region":{"startLine":%s,"startColumn":1}}}]}' "$index"
    done < violations.txt
  fi
  printf ']}]}'
}

ruff_sources() {
  cwd=$(pwd -P)
  find . -name '*.py' | sed -e 's#^\./##' | grep -v '^\.venv' | LC_ALL=C sort | while IFS= read -r file; do
    printf '%s/%s\n' "$cwd" "$file"
  done
}

ruff() {
  case "$1" in
    --version) printf 'ruff 0.9.9\n'; exit 0 ;;
  esac
  for argument in "$@"; do
    if [ "$argument" = --show-files ]; then
      [ ! -e sources.txt ] || slow "$@"
      ruff_sources
      exit 0
    fi
  done
  if [ "$1" = check ]; then
    sarif > "$(value_of --output-file "$@")"
    [ -z "$(first_line violations.txt)" ] || exit 1
    exit 0
  fi
  [ -z "$(first_line unformatted.txt)$(first_line unparsable.txt)" ] || slow "$@"
  exit 0
}

mypy() {
  if [ "$1" = --version ]; then printf 'mypy 1.13.0 (compiled: yes)\n'; exit 0; fi
  if [ -s type-errors.txt ]; then cat type-errors.txt; exit 1; fi
  exit 0
}

coverage() {
  case "$1" in
    --version) printf 'Coverage.py, version 7.6.1 with C extension\n'; exit 0 ;;
    run)
      status=$(first_line test-exit.txt)
      case "${status:-0}" in *[!0-9]*) slow "$@" ;; esac
      if [ "${status:-0}" -eq 0 ]; then printf '1 passed\n'; else printf '1 failed: test_greet\n'; fi
      exit "${status:-0}"
      ;;
    json) copy_or coverage-data.json "$(value_of -o "$@")" '{"files":{}}'; exit 0 ;;
  esac
  slow "$@"
}

lint_imports() {
  if [ "$1" = --version ]; then printf 'lint-imports, version 2.5\n'; exit 0; fi
  if [ ! -e lint-imports.txt ]; then printf 'Contracts: 0 kept, 0 broken.\n'; exit 0; fi
  cat lint-imports.txt
  if grep -q ' BROKEN' lint-imports.txt; then exit 1; fi
  exit 0
}

python() {
  case "$2" in
    *nitpicker_rules.py) copy_or rules.json "$4" '[]'; exit 0 ;;
    *sys.executable*) printf '%s/bin/python\n' "${VIRTUAL_ENV-/usr}"; exit 0 ;;
  esac
  case "$*" in
    *'"mutmut"'*)
      [ ! -e no-mutmut.txt ] || exit 1
      version=$(first_line mutmut-version.txt)
      printf '%s\n' "${version:-3.8.0}"
      exit 0
      ;;
  esac
  for argument in "$@"; do
    case "$argument" in
      *import-scan.py) if [ -e import-scan.json ]; then cat import-scan.json; else printf '{}'; fi; exit 0 ;;
    esac
  done
  case "$*" in
    *'"import-linter"'*) printf '2.5\n'; exit 0 ;;
  esac
  case "$1" in
    *.py) copy_or structure-data.json "$2" '[]'; exit 0 ;;
  esac
  [ ! -e no-pytest.txt ] || exit 1
  cov=0
  xdist=0
  [ ! -e pytest-cov.txt ] || cov=1
  [ ! -e xdist.txt ] || xdist=1
  printf '8.3.1 %s %s\n' "$cov" "$xdist"
  exit 0
}

[ -z "${FAKE_PYTHON_LOG+x}" ] && [ ! -e fail.json ] || slow "$@"
case "$tool" in
  ruff) ruff "$@" ;;
  mypy) mypy "$@" ;;
  coverage) coverage "$@" ;;
  lint-imports) lint_imports "$@" ;;
  python) python "$@" ;;
esac
slow "$@"
