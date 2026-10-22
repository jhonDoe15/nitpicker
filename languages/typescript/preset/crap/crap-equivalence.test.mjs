import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeCrap } from '../../adapters/quality-areas/reporting/tests.mjs';
import { measureCrap } from './measure.mjs';
import { reportFunctionsOf } from './report-functions.mjs';

const corpus = path.join(import.meta.dirname, 'fixtures/corpus');
const TYPESCRIPT_EXTENSIONS = ['ts', 'tsx', 'mts', 'cts'];
const JAVASCRIPT_EXTENSIONS = ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs'];

const expected = (name) => readFileSync(path.join(corpus, `expected-${name}.json`), 'utf8');

const former = (name) => JSON.parse(expected(name));
const formerWithoutNulls = (name) =>
  JSON.parse(expected(name), (_key, value) => (value === null ? undefined : value));

function measured(extensions) {
  const files = readdirSync(path.join(corpus, 'src/main')).map((name) =>
    path.join(corpus, 'src/main', name),
  );
  const analysis = measureCrap(corpus, files, {
    extensions,
    excludes: [],
    coverageReportPath: path.join(corpus, 'coverage-final.json'),
  });
  const functions = reportFunctionsOf(analysis.metrics).toSorted(
    (left, right) =>
      left.source.localeCompare(right.source) ||
      left.lines.start - right.lines.start ||
      left.lines.end - right.lines.end ||
      left.function.localeCompare(right.function),
  );
  return JSON.parse(JSON.stringify(functions));
}

const summary = (functions) => ({
  files: new Set(functions.map(({ source }) => source)).size,
  functions: functions.length,
  measuredFunctions: functions.filter(({ crap }) => typeof crap === 'number').length,
  unknownCoverageFunctions: functions.filter(({ crap }) => typeof crap !== 'number').length,
});

describe.each([
  ['TypeScript project', 'ts', TYPESCRIPT_EXTENSIONS],
  ['JavaScript project', 'js', JAVASCRIPT_EXTENSIONS],
])('CRAP of a %s against what the former library measured', (_name, golden, extensions) => {
  it('reports the same functions, complexity, coverage and score', () => {
    expect(measured(extensions)).toEqual(formerWithoutNulls(golden));
  });

  it('turns them into the same findings, so legacy findings stay legacy', () => {
    const now = measured(extensions);
    const before = former(golden);
    const normalize = (functions) =>
      normalizeCrap({ summary: summary(functions), functions }, 'crap', { scoreLimit: 2 });

    expect(normalize(now)).toEqual(normalize(before));
    expect(normalize(before).filter(({ rule }) => rule === 'crap-score-limit')).not.toEqual([]);
  });
});
