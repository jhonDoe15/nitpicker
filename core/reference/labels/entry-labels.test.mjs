import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readReferenceEntries } from '../../../shared/reference/store.mjs';
import { LABELS, isKind } from '../../labels/taxonomy.mts';
import { entryLabeler, labelProblems, labelTable } from './entry-labels.mts';
import { upstreamLabelResolver } from './upstream-labels.mts';

const entries = readReferenceEntries();
const ids = new Set(entries.map(({ id }) => id));
const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('the labels of the rule reference', () => {
  it('give every entry a kind first and only labels of the taxonomy', () => {
    const problems = entries.flatMap(({ id, labels }) => labelProblems(id, labels));

    expect(problems).toEqual([]);
    expect(entries.every(({ labels }) => labels.every((label) => LABELS.includes(label)))).toBe(
      true,
    );
  });

  it('name in the tables only rules the reference has', () => {
    const stale = [...labelTable().keys()].filter((id) => !ids.has(id));

    expect(stale).toEqual([]);
  });

  it('carry every kind and every framework somewhere', () => {
    const used = new Set(entries.flatMap(({ labels }) => labels));

    expect(LABELS.filter((label) => !used.has(label))).toEqual([]);
  });

  it('put the kinds first and the frameworks after them', () => {
    const misordered = entries.filter(({ labels }) => {
      const firstFramework = labels.findIndex((label) => !isKind(label));
      return firstFramework !== -1 && labels.slice(firstFramework).some(isKind);
    });

    expect(misordered.map(({ id }) => id)).toEqual([]);
  });
});

describe('upstreamLabelResolver', () => {
  const resolve = upstreamLabelResolver();

  it.each([
    [{ tool: 'pmd', rule: 'AvoidReassigningLoopVariables' }, ['maintainability']],
    [{ tool: 'pmd', rule: 'UseStringBufferForStringAppends' }, ['performance']],
    [{ tool: 'spotbugs', rule: 'NP_NULL_ON_SOME_PATH' }, ['bug']],
    [{ tool: 'spotbugs', rule: 'SQL_NONCONSTANT_STRING_PASSED_TO_EXECUTE' }, ['security']],
    [{ tool: 'checkstyle', rule: 'NeedBraces' }, ['style']],
    [{ tool: 'checkstyle', rule: 'RightCurlySame' }, ['style']],
    [{ tool: 'checkstyle', rule: 'CyclomaticComplexity' }, ['maintainability']],
    [{ tool: 'detekt', rule: 'detekt.performance.SpreadOperator' }, ['performance']],
    [{ tool: 'detekt', rule: 'detekt.coroutines.GlobalCoroutineUsage' }, ['bug', 'async']],
    [{ tool: 'ruff', rule: 'S102' }, ['security']],
    [{ tool: 'ruff', rule: 'PERF401' }, ['performance']],
    [{ tool: 'errorprone', rule: 'AnnotateFormatMethod' }, ['reliability']],
  ])('labels %o by its tool category', (entry, labels) => {
    expect(resolve(entry)).toEqual(labels);
  });

  it('knows no labels for a rule outside the snapshots', () => {
    expect(resolve({ tool: 'pmd', rule: 'NoSuchRule' })).toBeUndefined();
    expect(resolve({ tool: 'eslint', rule: 'no-var' })).toBeUndefined();
  });
});

describe('entryLabeler', () => {
  it('prefers the table, then the tool category, and orders kinds before frameworks', () => {
    const label = entryLabeler();

    expect(label({ id: 'pmd/UnorderedQuery', tool: 'pmd', rule: 'UnorderedQuery' })).toEqual({
      id: 'pmd/UnorderedQuery',
      tool: 'pmd',
      rule: 'UnorderedQuery',
      labels: ['bug', 'persistence'],
    });
    expect(label({ id: 'ruff/PERF401', tool: 'ruff', rule: 'PERF401' }).labels).toEqual([
      'performance',
    ]);
  });

  it('fails the build for a rule that has no labels', () => {
    const label = entryLabeler();

    expect(() => label({ id: 'pmd/NoSuchRule', tool: 'pmd', rule: 'NoSuchRule' })).toThrow(
      'pmd/NoSuchRule: no labels',
    );
  });
});

describe('labelProblems', () => {
  it('names unknown labels and a framework in first place', () => {
    expect(labelProblems('x/y', ['react', 'nonsense'])).toEqual([
      'x/y: unknown labels nonsense',
      'x/y: the first label must be a kind, not react',
    ]);
  });
});

describe('labelTable', () => {
  it('reads every JSON file of the folder and its subfolders', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'label-tables-'));
    temporaryRoots.push(root);
    mkdirSync(path.join(root, 'java'));
    writeFileSync(path.join(root, 'checks.json'), JSON.stringify({ 'a/b': ['bug'] }));
    writeFileSync(path.join(root, 'java', 'pmd.json'), JSON.stringify({ 'pmd/C': ['style'] }));

    expect([...labelTable(root)].toSorted(([left], [right]) => left.localeCompare(right))).toEqual([
      ['a/b', ['bug']],
      ['pmd/C', ['style']],
    ]);
  });
});
