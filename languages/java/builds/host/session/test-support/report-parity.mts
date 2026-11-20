import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const VOLATILE = /(?:^|\/)(?:test-results|nitpicker-lint|work)(?:\/|$)/u;
const JVM_NOTICE = /^(?:NOTE: )?Picked up /u;
const WORK_DIRECTORY = /\/tmp\/nitpicker-maven-\w+/gu;
const SECONDS = /in \d+(?:\.\d+)?s/gu;
const TIMESTAMP = /timestamp="[^"]*"/gu;

function sortedKeys(_key: string, value: unknown): unknown {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value).toSorted(([left], [right]) => left.localeCompare(right)),
      )
    : value;
}

function normalized(text: string, root: string, name: string): string {
  const canonical = name.endsWith('.json') ? JSON.stringify(JSON.parse(text), sortedKeys) : text;
  return canonical
    .replaceAll(root, '<root>')
    .split('\n')
    .filter((line) => !JVM_NOTICE.test(line))
    .join('\n')
    .replaceAll(WORK_DIRECTORY, '<work>')
    .replaceAll(SECONDS, 'in <seconds>')
    .replaceAll(TIMESTAMP, 'timestamp="<time>"');
}

export function reportsUnder(directory: string, root: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const file of readdirSync(directory, { recursive: true, withFileTypes: true })) {
    const full = path.join(file.parentPath, file.name);
    const key = path.relative(root, full).replaceAll('\\', '/');
    if (file.isFile() && !VOLATILE.test(key)) {
      found[key] = normalized(readFileSync(full, 'utf8'), root, file.name);
    }
  }
  return found;
}

export function hostedEvery(
  trace: readonly string[],
  tools: readonly string[],
  modules: number,
): boolean[] {
  return tools.map((tool) => trace.filter((line) => line === `hosted ${tool}`).length >= modules);
}

export function otherOutcomes(trace: readonly string[]): string[] {
  return trace.filter((line) => line !== '' && !line.startsWith('hosted '));
}
