import { describe, expect, it } from 'vitest';
import { compareFindings } from '../../../core/diff/comparison/compare.mjs';
import { buildCouplingReport, evaluateCoupling } from '../coupling.mjs';
import { STABILITY_FIX } from './stability-direction.mjs';
import { withUntouchedCause } from './untouched-cause.mjs';
import { libraryFile, libraryGraph, libraryProject } from './test-support/library-project.mjs';

const ROUTE =
  'If this is intended, add {"rule":"stability-direction"} to "exceptions" in nitpicker.config.json.';

function findingsOf(uses) {
  const graph = libraryGraph(uses);
  return evaluateCoupling(
    buildCouplingReport({ ...graph, fileOf: (file) => file }),
    'coupling',
  ).filter(({ classification }) => classification === 'enforceable');
}

function touched(files) {
  return {
    changedLines: new Map(files.map((file) => [file, { added: true, ranges: [], inserted: [] }])),
    isStrictRule: () => true,
  };
}

function stabilityFinding(message, cause) {
  return {
    tool: 'coupling',
    rule: 'stability-direction',
    path: 'src/features/members',
    identity: 'package-edge:src/features/members->src/features/members/adapters',
    message,
    classification: 'enforceable',
    cause,
  };
}

const MEMBERS_CAUSE = {
  files: ['src/features/members/api.x'],
  contributors: [
    { file: 'src/features/fines/adapters/store.x', unit: 'package src/features/fines/adapters' },
    { file: 'src/features/fines/domain/model.x', unit: 'package src/features/fines/domain' },
    { file: 'src/main.x', unit: 'package src' },
  ],
};

describe('a new stability finding on files the change did not edit', () => {
  it('names the changed files that added dependents, then the fix', () => {
    const fines = ['fines:face', 'fines:domain', 'fines:adapters', 'main'].map(libraryFile);
    const result = compareFindings({
      baseFindings: findingsOf(libraryProject().uses),
      headFindings: findingsOf(libraryProject({ withFines: true }).uses),
      touchedCode: touched(fines),
    });
    const members = result.newFindings.find(({ path }) => path === 'src/features/members');
    const own = result.newFindings.find(({ path }) => path === 'src/features/fines');

    expect(members.message).toBe(
      'src/features/members depends on less stable package src/features/members/adapters. ' +
        'The change edited none of its files: it moved the numbers through ' +
        'package src/features/fines/adapters (src/features/fines/adapters/store.x), ' +
        'package src/features/fines/domain (src/features/fines/domain/model.x), ' +
        `package src (src/main.x). ${STABILITY_FIX}`,
    );
    expect(own.message).toBe(
      'src/features/fines depends on less stable package src/features/fines/adapters',
    );
  });

  it('keeps the exception sentence last and the fix once', () => {
    const message = `Feature members depends on less stable feature fines. ${STABILITY_FIX} ${ROUTE}`;
    const [finding] = withUntouchedCause(
      [stabilityFinding(message, MEMBERS_CAUSE)],
      touched(['src/main.x']),
    );

    expect(finding.message).toBe(
      `Feature members depends on less stable feature fines. ${STABILITY_FIX} ` +
        `The change edited none of its files: it moved the numbers through package src (src/main.x). ${ROUTE}`,
    );
  });

  it('says so when no file behind it changed, and lists at most three files per unit', () => {
    const many = {
      files: ['src/a/x.x'],
      contributors: ['b1', 'b2', 'b3', 'b4'].map((name) => ({
        file: `src/b/${name}.x`,
        unit: 'package src/b',
      })),
    };
    const quiet = withUntouchedCause([stabilityFinding('a', MEMBERS_CAUSE)], touched([]));
    const busy = withUntouchedCause(
      [stabilityFinding('a', many)],
      touched(many.contributors.map(({ file }) => file)),
    );

    expect(quiet[0].message).toBe(
      `a. The change edited none of its files or of the files that depend on them. ${STABILITY_FIX}`,
    );
    expect(busy[0].message).toBe(
      'a. The change edited none of its files: it moved the numbers through ' +
        `package src/b (src/b/b1.x, src/b/b2.x, src/b/b3.x and 1 more). ${STABILITY_FIX}`,
    );
  });

  it('leaves a finding alone when the change edited one of its files or has no touched code', () => {
    const finding = stabilityFinding('a', MEMBERS_CAUSE);

    expect(withUntouchedCause([finding], touched(['src/features/members/api.x']))).toEqual([
      finding,
    ]);
    expect(withUntouchedCause([finding], undefined)).toEqual([finding]);
  });
});
