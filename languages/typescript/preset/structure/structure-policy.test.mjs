import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { analyzeProductionFiles, analyzeSource } from './analyze.mjs';

const fixtureRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/project/src/main',
);

describe('structural metrics report', () => {
  it('keeps simple functions and classes as low raw signals', () => {
    const analysis = analyzeSource(
      'export function add(left: number, right: number): number { return left + right; }\n' +
        'export class Tiny { public value(): number { return 1; } }\n',
      'simple.ts',
    );
    const add = analysis.functions.find((entry) => entry.function === 'add');
    const tiny = analysis.classes.find((entry) => entry.class === 'Tiny');

    expect(add).toEqual({
      source: 'simple.ts',
      function: 'add',
      start: 1,
      end: 1,
      lines: 1,
      parameters: 2,
      statements: 1,
      maxControlNesting: 0,
    });
    expect(tiny).toEqual({
      source: 'simple.ts',
      class: 'Tiny',
      start: 2,
      end: 2,
      lines: 1,
      members: 1,
      methods: 1,
    });
  });

  it('counts an else if chain as one level and an if inside an else block or a branch as one deeper', () => {
    const nestingOf = (body) =>
      analyzeSource(`function f(a: number, b: number): number {\n${body}\n  return 0;\n}\n`, 'f.ts')
        .functions[0].maxControlNesting;

    expect(nestingOf('if (a === 1) { return 1; }')).toBe(1);
    expect(
      nestingOf(
        'if (a === 1) { return 1; } else if (a === 2) { return 2; } else if (a === 3) { return 3; } else { return 4; }',
      ),
    ).toBe(1);
    expect(nestingOf('if (a === 1) { return 1; } else { if (b) { return 2; } }')).toBe(2);
    expect(nestingOf('if (a === 1) { return 1; } else if (a === 2) { if (b) { return 2; } }')).toBe(
      2,
    );
    expect(
      nestingOf(
        'for (;;) { if (a === 1) { break; } else if (a === 2) { break; } else if (b) { break; } }',
      ),
    ).toBe(2);
  });

  it('reports independent size, nesting, statement, and parameter signals', () => {
    const report = analyzeProductionFiles(fixtureRoot, 'fixture/src/main');
    const complex = report.functions.find((entry) => entry.function === 'coordinate');

    expect(report.summary.files).toBe(5);
    expect(report.functions.map((entry) => entry.source)).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/__tests__/)]),
    );
    expect(complex).toEqual({
      source: 'fixture/src/main/complex.ts',
      function: 'coordinate',
      start: 1,
      end: 17,
      lines: 17,
      parameters: 5,
      statements: 6,
      maxControlNesting: 3,
    });
    expect(complex.statements).toBeGreaterThan(4);
    expect(report.rankings.functionParameters[0].function).toBe('coordinate');
  });

  it('analyzes folders named like build output below the project root', () => {
    const sources = analyzeProductionFiles(fixtureRoot, 'fixture/src/main')
      .functions.map((entry) => entry.source)
      .filter((source) => source.endsWith('/folder-named-like-output.ts'))
      .sort();

    expect(sources).toEqual([
      'fixture/src/main/build/folder-named-like-output.ts',
      'fixture/src/main/dist/folder-named-like-output.ts',
      'fixture/src/main/generated/folder-named-like-output.ts',
    ]);
  });

  it('skips a source root that is build output at the project root', () => {
    expect(analyzeProductionFiles(fixtureRoot, 'dist').summary.files).toBe(0);
  });

  it('keeps anonymous function names stable when preceding lines move', () => {
    const source = 'consume([\n  () => true,\n]);\n';
    const shiftedSource = `\n${source}`;

    expect(analyzeSource(source, 'callbacks.ts').functions.map((entry) => entry.function)).toEqual([
      '<anonymous>',
    ]);
    expect(
      analyzeSource(shiftedSource, 'callbacks.ts').functions.map((entry) => entry.function),
    ).toEqual(['<anonymous>']);
  });

  it('parses JSX in .tsx files', () => {
    const source = [
      'export function NameList({ names }: { readonly names: readonly string[] }) {',
      '  return <ul>{names.map((name) => <li key={name}>{name}</li>)}</ul>;',
      '}',
      '',
    ].join('\n');

    expect(analyzeSource(source, 'name-list.tsx').functions.map((entry) => entry.function)).toEqual(
      ['NameList', 'NameList.<anonymous>'],
    );
  });

  it('fails visibly when TypeScript syntax cannot be parsed', () => {
    expect(() => analyzeSource('export function broken( {', 'broken.ts')).toThrow(
      /Unable to parse/,
    );
  });

  it('leaves the percentiles of a measure with no entries undefined, so the JSON report omits them', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-structure-empty-'));
    try {
      writeFileSync(path.join(root, 'plain.ts'), 'export const one = 1;\n');
      const report = analyzeProductionFiles(root, 'src');

      expect(report.distributions.classLines).toStrictEqual({
        p50: undefined,
        p90: undefined,
        p95: undefined,
        max: undefined,
      });
      expect(JSON.stringify(report.distributions.classLines)).toBe('{}');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
