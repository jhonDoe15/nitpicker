import { describe, expect, it } from 'vitest';
import type { MatchedCode } from '../../../core/diff/comparison/model/finding-types.mts';
import { compareFindings } from '../../../core/diff/comparison/compare.mts';
import { buildCouplingReport, evaluateCoupling } from '../coupling.mts';
import { firstOf } from '../facts/test-support/fact-fixtures.mts';
import type { Cause } from './stability-types.mts';
import { withUntouchedCause } from './untouched-cause.mts';
import { libraryFile, libraryGraph, libraryProject } from './test-support/library-project.mts';

const ROUTE =
  'If this is intended, add {"rule":"stability-direction"} to "exceptions" in nitpicker.config.json.';

function findingsOf(graph: Omit<Parameters<typeof buildCouplingReport>[0], 'fileOf'>) {
  return evaluateCoupling(
    buildCouplingReport({ ...graph, fileOf: (file) => file }),
    'coupling',
  ).filter(({ classification }) => classification === 'enforceable');
}

function touched(files: readonly string[]): MatchedCode {
  return {
    changedLines: new Map(files.map((file) => [file, { added: true, ranges: [], inserted: [] }])),
    isStrictRule: () => true,
  };
}

function unit(name: string, files: readonly string[]) {
  const first = files[0] ?? '';
  return {
    unit: name,
    folders: [first.slice(0, first.lastIndexOf('/'))],
    files,
    count: files.length,
  };
}

function stabilityFinding(message: string, units: Cause['units']) {
  return {
    tool: 'coupling',
    rule: 'stability-direction',
    path: 'src/features/members',
    identity: 'package-edge:src/features/members->src/features/members/adapters',
    message,
    classification: 'enforceable',
    cause: { folders: ['src/features/members'], units },
  };
}

const MOVED_BY = 'The change edited none of its files: it moved the numbers through';

describe('a new stability finding on files the change did not edit', () => {
  it('names the changed files around it, adds no second fix, and leaves no cause in the result', () => {
    const fines = ['fines:face', 'fines:domain', 'fines:adapters', 'main'].map(libraryFile);
    const result = compareFindings({
      baseFindings: findingsOf(libraryGraph(libraryProject().uses)),
      headFindings: findingsOf(libraryGraph(libraryProject({ withFines: true }).uses)),
      touchedCode: touched(fines),
    });
    const members = result.newFindings.find(({ path }) => path === 'src/features/members');
    const own = firstOf(result.newFindings.filter(({ path }) => path === 'src/features/fines'));

    expect(members).toEqual({
      tool: 'coupling',
      rule: 'stability-direction',
      path: 'src/features/members',
      identity: 'package-edge:src/features/members->src/features/members/adapters',
      message:
        `src/features/members depends on less stable package src/features/members/adapters. ${MOVED_BY} ` +
        'package src (src/main.x), package src/features/fines/adapters (src/features/fines/adapters/store.x), ' +
        'package src/features/fines/domain (src/features/fines/domain/model.x).',
      classification: 'enforceable',
    });
    expect(own.message).toBe(
      'src/features/fines depends on less stable package src/features/fines/adapters',
    );
  });

  it('says the numbers moved elsewhere when the change only removed dependents', () => {
    const graph = (extra: readonly string[][]) => ({
      modules: ['s/a.x', 't/a.x', 'x/1.x', 'x/2.x', 'x/3.x', 'l/a.x', 'y/1.x', 'y/2.x'],
      edges: [
        ['s/a.x', 't/a.x'],
        ['t/a.x', 'l/a.x'],
        ['y/1.x', 's/a.x'],
        ['y/2.x', 's/a.x'],
        ...extra,
      ].map(([source = '', target = '']) => ({ source, target })),
      packageOf: (file: string) => file.slice(0, file.lastIndexOf('/')),
    });
    const dependents = ['x/1.x', 'x/2.x', 'x/3.x'];
    const result = compareFindings({
      baseFindings: findingsOf(graph(dependents.map((file) => [file, 't/a.x']))),
      headFindings: findingsOf(graph([])),
      touchedCode: touched(dependents),
    });

    expect(result.newFindings.map(({ message }) => message)).toEqual([
      's depends on less stable package t. The change edited none of its files or of the files around it now, so the numbers moved through dependencies it removed or files it added elsewhere.',
    ]);
  });

  it('keeps the exception sentence last and lists at most three changed files per unit', () => {
    const changed = ['src/b/b1.x', 'src/b/b2.x', 'src/b/b3.x', 'src/b/b4.x'];
    const finding = firstOf(
      withUntouchedCause(
        [stabilityFinding(`a. ${ROUTE}`, [unit('package src/b', changed.slice(0, 3))])],
        touched(changed),
      ),
    );

    expect(finding.message).toBe(
      `a. ${MOVED_BY} package src/b (src/b/b1.x, src/b/b2.x, src/b/b3.x and 1 more). ${ROUTE}`,
    );
  });

  it('leaves a finding alone when the change edited a file in its folders or has no touched code', () => {
    const finding = stabilityFinding('a', [unit('package src/b', ['src/b/b1.x'])]);

    expect(withUntouchedCause([finding], touched(['src/features/members/api.x']))).toEqual([
      finding,
    ]);
    expect(withUntouchedCause([finding], undefined)).toEqual([finding]);
  });
});
