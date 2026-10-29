import { changedOccurrences } from '../../occurrences.mjs';
import { gradleGateLines } from './gradle.mjs';
import { mavenGateLines } from './maven.mjs';
import { RISKY, TOOLS } from './tools.mjs';

const propertyGateLines = (text) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => !line.startsWith('#') && TOOLS.test(line))
    .map((line) => ({ text: line, declaration: false }));

/**
 * The lines of a build file that touch test, coverage or analysis settings, as `{ text, group,
 * declaration }`: any line naming such a tool or setting (a plugin, a dependency on it,
 * `ignoreFailures`, `skipTests`), every line inside a block of one (`jacoco { ... }`, a Maven
 * plugin of one), and the lines of a test block that choose which tests run (`exclude`, `filter`,
 * `enabled`, `useJUnitPlatform`). Gradle scripts of any name, `buildSrc` sources, pom.xml,
 * gradle.properties and .mvn/maven.config are read.
 */
export function gateLinesOf(file, text) {
  if (file.endsWith('pom.xml')) return mavenGateLines(text);
  if (/\.(?:properties|config)$/u.test(file)) return propertyGateLines(text);
  return gradleGateLines(file, text);
}

// An added line that declares a plugin or dependency, or sits in a block that is new, adds a
// capability; it counts only when it also lowers a threshold, skips a check or ignores a failure.
const isPureAddition = (entry, knownGroups) =>
  (entry.declaration || (entry.group !== undefined && !knownGroups.has(entry.group))) &&
  !RISKY.test(entry.text);

/**
 * Compares the gate lines of a build file before and after. Removed lines always count. An added
 * plugin, dependency or new tool block counts only when it carries a risky setting (see
 * `isPureAddition`); a change that edits another part of the build reports nothing. Returns the
 * lines added and removed.
 */
export function changedGateLines(file, before, after) {
  const read = (text) =>
    gateLinesOf(file, text ?? '').map((entry) => ({ ...entry, key: entry.text }));
  const known = new Set(read(before).flatMap(({ group }) => group ?? []));
  const { added, removed } = changedOccurrences(read(before), read(after));
  return {
    added: added.filter((entry) => !isPureAddition(entry, known)).map(({ text }) => text),
    removed: removed.map(({ text }) => text),
  };
}
