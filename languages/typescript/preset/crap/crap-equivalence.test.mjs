import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeCrap } from '../../adapters/quality-areas-runner.mjs';
import { measureCrap } from './measure.mjs';
import { reportFunctionsOf } from './report-functions.mjs';

const corpus = path.join(import.meta.dirname, 'fixtures/corpus');
const TYPESCRIPT_EXTENSIONS = ['ts', 'tsx', 'mts', 'cts'];
const JAVASCRIPT_EXTENSIONS = ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs'];

const expected = (name) =>
  JSON.parse(readFileSync(path.join(corpus, `expected-${name}.json`), 'utf8'));

function measured(extensions) {
  const files = readdirSync(path.join(corpus, 'src/main')).map((name) =>
    path.join(corpus, 'src/main', name),
  );
  const analysis = measureCrap(corpus, files, {
    extensions,
    excludes: [],
    coverageReportPath: path.join(corpus, 'coverage-final.json'),
  });
  return reportFunctionsOf(analysis.metrics).toSorted(
    (left, right) =>
      left.source.localeCompare(right.source) ||
      left.lines.start - right.lines.start ||
      left.lines.end - right.lines.end ||
      left.function.localeCompare(right.function),
  );
}

const summary = (functions) => ({
  files: new Set(functions.map(({ source }) => source)).size,
  functions: functions.length,
  measuredFunctions: functions.filter(({ crap }) => crap !== null).length,
  unknownCoverageFunctions: functions.filter(({ crap }) => crap === null).length,
});

describe.each([
  ['TypeScript project', 'ts', TYPESCRIPT_EXTENSIONS],
  ['JavaScript project', 'js', JAVASCRIPT_EXTENSIONS],
])('CRAP of a %s against what the former library measured', (_name, golden, extensions) => {
  it('reports the same functions, complexity, coverage and score', () => {
    expect(measured(extensions)).toEqual(expected(golden));
  });

  it('turns them into the same findings, so legacy findings stay legacy', () => {
    const now = measured(extensions);
    const former = expected(golden);
    const normalize = (functions) =>
      normalizeCrap({ summary: summary(functions), functions }, 'crap', { scoreLimit: 2 });

    expect(normalize(now)).toEqual(normalize(former));
    expect(normalize(former).filter(({ rule }) => rule === 'crap-score-limit')).not.toEqual([]);
  });
});
