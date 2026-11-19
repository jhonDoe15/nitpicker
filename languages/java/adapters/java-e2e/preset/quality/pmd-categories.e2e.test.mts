import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyFindingPolicy as applyFindingPolicyUntyped } from '../../../../../../shared/findings/finding-policy.mjs';
import { compareFindings as compareFindingsUntyped } from '../../../../../../core/diff/comparison/compare.mjs';
import { fieldOf, textOf } from '../../../../../../shared/values/readers.mts';
import {
  preparePmdProbe,
  readPmdProbeFindings,
  runPmdProbe,
} from '../../test-support/pmd/pmd-probe.mts';
import { callUntyped, findingsOf, type JavaFinding } from '../../../typed/java-values.mts';

function applyFindingPolicy(
  findings: readonly JavaFinding[],
  policy: { exceptions: readonly object[] },
): JavaFinding[] {
  return findingsOf(callUntyped(applyFindingPolicyUntyped, findings, policy));
}

function compareFindings(input: {
  baseFindings: readonly JavaFinding[];
  headFindings: readonly JavaFinding[];
}): unknown {
  return callUntyped(compareFindingsUntyped, input);
}

const enabled = process.env['NITPICKER_JAVA_E2E'] === '1';
const gradle = process.env['NITPICKER_GRADLE'] ?? 'gradle';
const fixtures = path.resolve(import.meta.dirname, '../../fixtures/pmd-categories');
const categories = new Set([
  'AddEmptyString',
  'AppendCharacterWithChar',
  'AvoidArrayLoops',
  'AvoidCalendarDateCreation',
  'AvoidFileStream',
  'AvoidInstantiatingObjectsInLoops',
  'CheckResultSet',
  'BigIntegerInstantiation',
  'ConsecutiveAppendsShouldReuse',
  'ConsecutiveLiteralAppends',
  'InefficientEmptyStringCheck',
  'InefficientStringBuffering',
  'InsufficientStringBufferDeclaration',
  'OptimizableToArrayCall',
  'RedundantFieldInitializer',
  'StringInstantiation',
  'StringToString',
  'TooFewBranchesForASwitchStatement',
  'TooFewBranchesForSwitch',
  'UseArrayListInsteadOfVector',
  'UseArraysAsList',
  'UseIndexOfChar',
  'UseIOStreamsWithApacheCommonsFileItem',
  'UselessStringValueOf',
  'UseStringBufferForStringAppends',
  'UseStringBufferLength',
  'AvoidSynchronizedAtMethodLevel',
  'AvoidSynchronizedStatement',
  'AvoidThreadGroup',
  'AvoidUsingVolatile',
  'DoNotUseThreads',
  'DontCallThreadRun',
  'DoubleCheckedLocking',
  'NonThreadSafeSingleton',
  'UnsynchronizedStaticFormatter',
  'UnusedFormalParameter',
  'UseConcurrentHashMap',
  'UseNotifyAllInsteadOfNotify',
  'HardCodedCryptoKey',
  'InsecureCryptoIv',
]);
let root: string | undefined;
let findings: JavaFinding[];
let shifted: JavaFinding[];

describe.skipIf(!enabled)('pinned PMD additional categories', () => {
  beforeAll(() => {
    root = preparePmdProbe('pmd-categories');
    for (const role of ['main', 'test']) {
      cpSync(fixtures, path.join(root, 'src', role, 'java/demo'), { recursive: true });
    }
    runPmdProbe(root, gradle);
    findings = readPmdProbeFindings(root);
    for (const role of ['main', 'test']) {
      const file = path.join(root, 'src', role, 'java/demo/Banned.java');
      writeFileSync(file, `\n\n\n\n\n${readFileSync(file, 'utf8')}`);
    }
    runPmdProbe(root, gradle);
    shifted = readPmdProbeFindings(root);
  });

  afterAll(() => {
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
  });

  const reported = (role: string) =>
    findings
      .filter((finding) => finding.path === `src/${role}/java/demo/Banned.java`)
      .filter((finding) => categories.has(finding.rule))
      .map(({ rule }) => rule)
      .sort();

  it('runs all three categories on main sources', () => {
    expect(reported('main')).toEqual([
      'AvoidArrayLoops',
      'AvoidFileStream',
      'DontCallThreadRun',
      'HardCodedCryptoKey',
      'InsecureCryptoIv',
      'StringInstantiation',
      'UnusedFormalParameter',
      'UseArraysAsList',
    ]);
  });

  it('leaves the security category out of test sources, where fixed keys check known output', () => {
    expect(reported('test')).toEqual([
      'AvoidArrayLoops',
      'AvoidFileStream',
      'DontCallThreadRun',
      'StringInstantiation',
      'UnusedFormalParameter',
      'UseArraysAsList',
    ]);
  });

  it('reports a navigation result that no condition checks', () => {
    expect(
      findings
        .filter(
          ({ path: file, rule }) =>
            file === 'src/main/java/demo/Results.java' && rule === 'CheckResultSet',
        )
        .map(({ location }) => location?.line),
    ).toEqual([8, 16]);
  });

  it('allows the corrected forms and structurally excluded patterns', () => {
    expect(
      findings.filter(
        ({ path: file, rule }) => file.endsWith('/Allowed.java') && categories.has(rule),
      ),
    ).toEqual([]);
  });

  it('keeps identities when findings move and applies reviewed path exceptions', () => {
    const banned = findings.filter(
      ({ path: file, rule }) => file.endsWith('/Banned.java') && categories.has(rule),
    );
    const moved = shifted.filter(
      ({ path: file, rule }) => file.endsWith('/Banned.java') && categories.has(rule),
    );
    expect(moved.map(({ location }) => location?.line)).toEqual(
      banned.map(({ location }) => (location?.line ?? 0) + 5),
    );
    expect(
      fieldOf(compareFindings({ baseFindings: banned, headFindings: moved }), 'newFindings'),
    ).toEqual([]);
    expect(
      applyFindingPolicy(banned, {
        exceptions: [{ rule: 'pmd/HardCodedCryptoKey', glob: 'src/main/**' }],
      })
        .map(({ rule, path: file }) => `${file}:${rule}`)
        .sort(),
    ).toEqual(
      banned
        .filter(
          ({ rule, path: file }) =>
            !(rule === 'HardCodedCryptoKey' && file.startsWith('src/main/')),
        )
        .map(({ rule, path: file }) => `${file}:${rule}`)
        .sort(),
    );
    expect(banned.every(({ message }) => textOf(message).includes('nitpicker.config.json'))).toBe(
      true,
    );
  });
});
