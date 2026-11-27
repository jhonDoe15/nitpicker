#!/bin/bash
# corpus.sh <work dir> <Lombok version>... : Error Prone and the engine on Lombok's own transformation test sources
# JOBS=<n> runs n files at a time; ONLY=<name pattern> runs the matching test files only
set -euo pipefail
work=$(realpath -m "$1"); shift
here=$(cd "$(dirname "$0")" && pwd); repo=$(cd "$here/../../../.." && pwd)
engine=${ENGINE:-$repo/engine/target/release/nitpicker-engine}
jobs=${JOBS:-$(nproc)}
central=https://repo1.maven.org/maven2
mkdir -p "$work/tools/lib" "$work/tools/stubs"
fetch() {
  [ -s "$2" ] && return 0
  for wait in 2 5 10 20 40; do curl -sfL -o "$2.part" "$1" && mv "$2.part" "$2" && return 0; sleep $wait; done
  echo "could not fetch $1" >&2; return 1
}
jar() {
  local group=${1%%:*} rest=${1#*:}; local artifact=${rest%%:*} version=${rest#*:}
  fetch "$central/${group//.//}/$artifact/$version/$artifact-$version${2:-}.jar" "$work/tools/lib/$artifact-$version.jar"
  echo "$work/tools/lib/$artifact-$version.jar"
}
checks=$repo/languages/java/gradle/errorprone/checks.json
version() { python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['reviewed'][sys.argv[2]])" "$checks" "$1"; }
if [ ! -f "$work/tools/ep/.done" ]; then
  rm -rf "$work/tools/ep"
  cat > "$work/tools/pom.xml" <<POM
<project><modelVersion>4.0.0</modelVersion><groupId>x</groupId><artifactId>x</artifactId><version>1</version>
<dependencies>
<dependency><groupId>com.google.errorprone</groupId><artifactId>error_prone_core</artifactId>
<version>$(version errorProne)</version></dependency>
<dependency><groupId>com.uber.nullaway</groupId><artifactId>nullaway</artifactId>
<version>$(version nullAway)</version></dependency>
</dependencies></project>
POM
  mvn -q -B -f "$work/tools/pom.xml" dependency:copy-dependencies -DoutputDirectory="$work/tools/ep"
  touch "$work/tools/ep/.done"
fi
ep=$(ls "$work"/tools/ep/*.jar | paste -sd:)
classpath=""
while read -r coordinates; do classpath="$classpath:$(jar "$coordinates")"; done < "$here/deps.txt"
unset JAVA_TOOL_OPTIONS _JAVA_OPTIONS
opens=""
for p in api file main model parser processing tree util code comp; do
  opens="$opens --add-exports=jdk.compiler/com.sun.tools.javac.$p=ALL-UNNAMED"
done
opens="$opens --add-opens=jdk.compiler/com.sun.tools.javac.code=ALL-UNNAMED"
opens="$opens --add-opens=jdk.compiler/com.sun.tools.javac.comp=ALL-UNNAMED"
javac $opens -cp "$ep" -d "$work/tools" "$repo/engine/parity/errorprone/ErrorProneRun.java"
export work ep opens engine repo
run_one() {
  local folder=$1 off=NullAway lombok=$2
  run_ep() {
    rm -f "$folder"/ep.json.error*
    (cd "$folder" && java -Xmx2g -Xss16m $opens -Dep.path="$ep" -Dep.off="$off" -cp "$work/tools:$ep" ErrorProneRun ep \
      "$folder/ep.json" "$repo/languages/java/gradle/errorprone/checks.json" "$folder/cp.txt" "$folder/sources.txt" \
      -processorpath "$lombok" > "$folder/ep.log" 2>&1) || true
  }
  run_ep
  for attempt in 1 2 3 4; do
    crashed=$(grep -h "BugPattern: " "$folder"/ep.json.error* 2>/dev/null | sed 's/.*BugPattern: //' | sort -u | paste -sd, || true)
    [ -z "$crashed" ] && break
    case ",$off," in *",$crashed,"*) break ;; esac
    off="$off,$crashed"; echo "$off" > "$folder/crashed.txt"; run_ep
  done
  "$engine" --files "$folder/sources.txt" --rules _ErrorProne --classpath "$folder/cp.txt" --out "$folder/engine.json" \
    --lombok --classes "$folder/ep.json.classes" > "$folder/engine.log" 2>&1 || true
}
export -f run_one
for version in "$@"; do
  lombok=$(jar "org.projectlombok:lombok:$version")
  source="$work/source-$version"
  if [ ! -f "$source/.done" ]; then
    rm -rf "$source"
    git clone -q --depth 1 -b "v$version" https://github.com/projectlombok/lombok "$source" 2> /dev/null
    touch "$source/.done"
  fi
  stubs="$work/tools/stubs-$version"
  if [ ! -f "$stubs/.done" ]; then
    rm -rf "$stubs"; mkdir -p "$stubs"
    find "$source/test/stubs" -name '*.java' -not -path '*/stubs/java/*' > "$stubs.txt"
    javac -nowarn -proc:none -d "$stubs" @"$stubs.txt" > /dev/null 2>&1 || true
    touch "$stubs/.done"
  fi
  out="$work/$version"; rm -rf "$out"; mkdir -p "$out"
  python3 "$here/corpus.py" prepare "$source" "$out" "$lombok:$stubs$classpath"
  find "$out" -mindepth 1 -maxdepth 1 -type d -name "${ONLY:-*}" | sort | xargs -P "$jobs" -I{} bash -c 'run_one "$1" "$2"' _ {} "$lombok"
  python3 "$here/corpus.py" table "$out" "$repo/engine/parity/errorprone/ported.json" | tee "$out/table.md"
done
[ $# -gt 1 ] && python3 "$here/corpus.py" versions "$work" "$@" | tee "$work/versions.md"
exit 0
