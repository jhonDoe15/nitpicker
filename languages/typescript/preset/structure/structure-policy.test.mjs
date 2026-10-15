import {
  expectedOutput21_17,
  expectedOutput22_18,
  expectedOutput33_21,
} from '../../../../core/diff/fixtures/expected-output/languages-typescript-preset-structure-structure-policy.mjs';
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

    expect(add).toEqual(expectedOutput21_17());
    expect(tiny).toEqual(expectedOutput22_18());
  });

  it('reports independent size, nesting, statement, and parameter signals', () => {
    const report = analyzeProductionFiles(fixtureRoot, 'fixture/src/main');
    const complex = report.functions.find((entry) => entry.function === 'coordinate');

    expect(report.summary.files).toBe(2);
    expect(report.functions.map((entry) => entry.source)).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/dist|build|generated|__tests__/)]),
    );
    expect(complex).toEqual(expectedOutput33_21());
    expect(complex.statements).toBeGreaterThan(4);
    expect(report.rankings.functionParameters[0].function).toBe('coordinate');
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

  it('fails visibly when TypeScript syntax cannot be parsed', () => {
    expect(() => analyzeSource('export function broken( {', 'broken.ts')).toThrow(
      /Unable to parse/,
    );
  });
});
