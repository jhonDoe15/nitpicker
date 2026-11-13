import { readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { containedPath } from '../../core/fix/common/contained-path.mjs';

export const EXCLUDED_FROM_SELF_FIXTURE = new RegExp(
  [
    '/node_modules(/|$)',
    '/fixtures(/|$)',
    '/(?:cli|installed|pack-contents|tool-resolution|aggregate-shards)\\.test\\.mjs$',
    '/(?:run-snapshot|analyzer-scheduler|check)\\.test\\.mjs$',
    '/(?:coding-standards-inventory|defaults-in-place|architecture-rules)\\.test\\.mjs$',
    '-policy\\.test\\.mjs$',
  ].join('|'),
);

export const CONSUMER_SOURCE = 'export function example() {\n  return 1;\n}\n';

export const CONSUMER_TEST =
  "import { expect, it } from 'vitest';\nimport { example } from '../src/main/example.js';\n\n" +
  "it('returns one', () => {\n  expect(example()).toBe(1);\n});\n";

export function generatedModule(index: number): string {
  const id = String(index);
  return `export type Grade${id} = 'low' | 'mid' | 'high';

export function grade${id}(value: number): Grade${id} {
  if (value < ${String(index + 10)}) {
    return 'low';
  }
  if (value < ${String(index + 100)}) {
    return 'mid';
  }
  return 'high';
}

export function clamp${id}(value: number, minimum: number, maximum: number): number {
  if (minimum > maximum) {
    throw new RangeError('minimum exceeds maximum');
  }
  return Math.min(Math.max(value, minimum), maximum);
}

export function summarize${id}(values: readonly number[]): { total: number; grades: Grade${id}[] } {
  let total = 0;
  const grades: Grade${id}[] = [];
  for (const value of values) {
    if (Number.isNaN(value)) {
      continue;
    }
    total += clamp${id}(value, 0, ${String(index + 1000)});
    grades.push(grade${id}(value));
  }
  return { total, grades };
}
`;
}

const MID_OFFSET = 50;
const HIGH_OFFSET = 500;
const SUMMED_OFFSET = 200;

export function generatedTest(index: number): string {
  const id = String(index);
  return `import { describe, expect, it } from 'vitest';
import { clamp${id}, grade${id}, summarize${id} } from './rules.js';

describe('feature ${id}', () => {
  it('grades values', () => {
    expect(grade${id}(0)).toBe('low');
    expect(grade${id}(${String(index + MID_OFFSET)})).toBe('mid');
    expect(grade${id}(${String(index + HIGH_OFFSET)})).toBe('high');
  });
  it('clamps and validates bounds', () => {
    expect(clamp${id}(5, 0, 3)).toBe(3);
    expect(clamp${id}(-5, 0, 3)).toBe(0);
    expect(() => clamp${id}(1, 3, 0)).toThrow(RangeError);
  });
  it('summarizes while skipping NaN', () => {
    expect(summarize${id}([1, Number.NaN, ${String(index + SUMMED_OFFSET)}])).toEqual({
      total: ${String(index + SUMMED_OFFSET + 1)},
      grades: ['low', 'high'],
    });
  });
});
`;
}

export function convertToTypeScript(directory: string): void {
  const modules = readdirSync(directory, { withFileTypes: true, recursive: true }).filter(
    (entry) => entry.isFile() && entry.name.endsWith('.mjs'),
  );
  for (const entry of modules) {
    const file = containedPath(entry.parentPath, entry.name);
    const converted = readFileSync(file, 'utf8').replace(/\.mjs(['"`])/gu, '.ts$1');
    writeFileSync(file, converted);
    renameSync(file, file.replace(/\.mjs$/u, '.ts'));
  }
}
