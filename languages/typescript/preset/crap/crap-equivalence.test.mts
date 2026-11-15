import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeCrap } from '../../adapters/quality-areas/reporting/tests.mts';
import { parseJson } from '../../../../shared/values/readers.mts';
import { measureCrap } from './measure.mts';
import { reportFunctionsOf } from './report-functions.mts';

const corpus = path.join(import.meta.dirname, 'fixtures/corpus');
const TYPESCRIPT_EXTENSIONS = ['ts', 'tsx', 'mts', 'cts'];
const JAVASCRIPT_EXTENSIONS = ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs'];

type CrapReport = Parameters<typeof normalizeCrap>[0];
type Functions = NonNullable<CrapReport['functions']>;

const expected = (name: string) => readFileSync(path.join(corpus, `expected-${name}.json`), 'utf8');

function isFunctions(value: unknown): value is Functions {
  return Array.isArray(value);
}

function functionsFrom(text: string): Functions {
  const parsed = parseJson(text);
  if (!isFunctions(parsed)) {
    throw new TypeError('Expected a list of CRAP functions');
  }
  return parsed;
}

const former = (name: string): Functions => functionsFrom(expected(name));
const formerWithoutNulls = (name: string): unknown =>
  JSON.parse(expected(name), (_key, value: unknown) => (value === null ? undefined : value));

function measured(extensions: readonly string[]): Functions {
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
  return functionsFrom(JSON.stringify(functions));
}

const summary = (functions: Functions) => ({
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
    const normalize = (functions: Functions) =>
      normalizeCrap({ summary: summary(functions), functions }, 'crap', { scoreLimit: 2 });

    expect(normalize(now)).toEqual(normalize(before));
    expect(normalize(before).filter(({ rule }) => rule === 'crap-score-limit')).not.toEqual([]);
  });
});
