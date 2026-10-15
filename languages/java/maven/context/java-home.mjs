const RUNTIME_LINE = /^Java version: .*?, runtime: (.+)$/mu;

export function javaHomeFrom(versionOutput) {
  const home = RUNTIME_LINE.exec(versionOutput)?.[1]?.trim();
  if (home === undefined || home === '') {
    throw new Error(`Could not read the Java runtime from "mvn -v":\n${versionOutput.trim()}`);
  }
  return home;
}
