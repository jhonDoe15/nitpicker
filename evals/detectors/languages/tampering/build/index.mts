import { changedOccurrences } from '../../occurrences.mts';
import { gradleGateLines } from './gradle.mts';
import { mavenGateLines } from './maven.mts';
import { type GateLine, RISKY, TOOLS } from './tools.mts';

function propertyGateLines(text: string): GateLine[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => !line.startsWith('#') && TOOLS.test(line))
    .map((line) => ({ text: line, declaration: false }));
}

export function gateLinesOf(file: string, text: string): GateLine[] {
  if (file.endsWith('pom.xml')) return mavenGateLines(text);
  if (/\.(?:properties|config)$/u.test(file)) return propertyGateLines(text);
  return gradleGateLines(file, text);
}

function isPureAddition(entry: GateLine, knownGroups: ReadonlySet<string>): boolean {
  return (
    (entry.declaration || (entry.group !== undefined && !knownGroups.has(entry.group))) &&
    !RISKY.test(entry.text)
  );
}

export function changedGateLines(
  file: string,
  before: string | undefined,
  after: string | undefined,
): { added: string[]; removed: string[] } {
  function read(text: string | undefined): (GateLine & { key: string })[] {
    return gateLinesOf(file, text ?? '').map((entry) => ({ ...entry, key: entry.text }));
  }
  const known = new Set(read(before).flatMap(({ group }) => group ?? []));
  const { added, removed } = changedOccurrences(read(before), read(after));
  return {
    added: added.filter((entry) => !isPureAddition(entry, known)).map(({ text }) => text),
    removed: removed.map(({ text }) => text),
  };
}
