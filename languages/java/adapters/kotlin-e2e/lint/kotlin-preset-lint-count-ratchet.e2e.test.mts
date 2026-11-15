import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Finding } from '../../../../../shared/values/findings.mts';
import { assigned } from '../test-support/views/assigned.mts';
import {
  commitBranch,
  commitFromBranch,
  diffOf,
  initializeProject,
  kotlinE2eEnabled,
  kotlinSources,
  removeProject,
} from '../__tests__/kotlin-e2e-project.mts';
import type { KotlinProject } from '../__tests__/kotlin-e2e-project.mts';

type Branch = readonly [number, string];

const COUNTED = ['detekt.style.ReturnCount', 'detekt.style.ThrowsCount'];

const branch = (code: Branch) =>
  `    if (code == ${String(code[0])}) {\n        ${code[1]}\n    }\n`;

function picker(branches: readonly Branch[]) {
  return [
    'package demo\n',
    'class Problem(message: String) : RuntimeException(message)\n',
    'fun pick(code: Int): Int {',
    ...branches.map(branch),
    '    return 0\n}\n',
  ].join('\n');
}

const LEGACY: Branch[] = [
  [0, 'throw Problem("zero")'],
  [1, 'throw Problem("one")'],
  [2, 'throw Problem("two")'],
  [-1, 'return 1'],
  [10, 'return 2'],
];

function counted(findings: Finding[]) {
  return findings
    .filter(({ rule }) => COUNTED.includes(rule))
    .map(
      ({ rule, message }) => `${String(rule.split('.').at(-1))}: ${String(message.split('. ')[0])}`,
    )
    .sort();
}

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset detekt counts on a legacy function', () => {
  let project: KotlinProject | undefined;
  beforeAll(() => {
    project = initializeProject();
    commitBranch(project, 'count-legacy', { [`${kotlinSources}/Picker.kt`]: picker(LEGACY) });
    commitFromBranch(project, {
      name: 'count-grown',
      from: 'count-legacy',
      files: {
        [`${kotlinSources}/Picker.kt`]: picker([
          ...LEGACY,
          [3, 'throw Problem("three")'],
          [4, 'return 2'],
        ]),
      },
    });
    commitFromBranch(project, {
      name: 'count-edited',
      from: 'count-legacy',
      files: {
        [`${kotlinSources}/Picker.kt`]: picker(
          LEGACY.map(([code, body]): Branch => [code, body.replace('"one"', '"first"')]),
        ),
      },
    });
  });

  afterAll(() => {
    removeProject(assigned(project, 'project'));
  });

  it('fails a legacy function that gained a return and a throw over the limits', () => {
    const result = diffOf(assigned(project, 'project'), 'count-grown', { base: 'count-legacy' });

    expect(counted(result.newEnforceable)).toEqual([
      'ReturnCount: Return statements grew from 3 to 4',
      'ThrowsCount: Throw statements grew from 3 to 4',
    ]);
  });

  it('keeps a legacy function whose counts did not change', () => {
    const result = diffOf(assigned(project, 'project'), 'count-edited', { base: 'count-legacy' });

    expect(counted(result.newEnforceable)).toEqual([]);
    expect(counted(result.unchangedFindings).map((line) => line.split(':')[0])).toEqual([
      'ReturnCount',
      'ThrowsCount',
    ]);
  });
});
