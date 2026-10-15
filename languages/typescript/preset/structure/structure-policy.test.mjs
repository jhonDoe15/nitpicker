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

    expect(add).toMatchObject({ parameters: 2, statements: 1, maxControlNesting: 0 });
    expect(tiny).toMatchObject({ members: 1, methods: 1 });
  });

  it('reports independent size, nesting, statement, and parameter signals', () => {
    const report = analyzeProductionFiles(fixtureRoot, 'fixture/src/main');
    const complex = report.functions.find((entry) => entry.function === 'coordinate');

    expect(report.summary.files).toBe(5);
    expect(report.functions.map((entry) => entry.source)).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/__tests__/)]),
    );
    expect(complex).toMatchObject({ parameters: 5, maxControlNesting: 3 });
    expect(complex.statements).toBeGreaterThan(4);
    expect(report.rankings.functionParameters[0].function).toBe('coordinate');
  });

  it('analyzes folders named like build output below the project root', () => {
    const sources = analyzeProductionFiles(fixtureRoot, 'fixture/src/main').functions.map(
      (entry) => entry.source,
    );

    expect(sources).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/\/dist\//),
        expect.stringMatching(/\/build\//),
        expect.stringMatching(/\/generated\//),
      ]),
    );
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
      ['NameList', '<anonymous>'],
    );
  });

  it('fails visibly when TypeScript syntax cannot be parsed', () => {
    expect(() => analyzeSource('export function broken( {', 'broken.ts')).toThrow(
      /Unable to parse/,
    );
  });
});
