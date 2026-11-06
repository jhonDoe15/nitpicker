import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyFindingPolicy } from '../../../../../../shared/findings/finding-policy.mjs';
import { compareFindings } from '../../../../../../core/diff/comparison/compare.mjs';
import {
  preparePmdProbe,
  readPmdProbeFindings,
  runPmdProbe,
} from '../../test-support/pmd-probe.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const fixtures = path.resolve(import.meta.dirname, '../../fixtures/pmd-categories');
const categories = new Set([
  'AddEmptyString',
  'AppendCharacterWithChar',
  'AvoidArrayLoops',
  'AvoidCalendarDateCreation',
  'AvoidFileStream',
  'AvoidInstantiatingObjectsInLoops',
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
  'UseConcurrentHashMap',
  'UseNotifyAllInsteadOfNotify',
  'HardCodedCryptoKey',
  'InsecureCryptoIv',
]);
let root;
let findings;
let shifted;

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

  const reported = (role) =>
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
      'UseArraysAsList',
    ]);
  });

  it('leaves the security category out of test sources, where fixed keys check known output', () => {
    expect(reported('test')).toEqual([
      'AvoidArrayLoops',
      'AvoidFileStream',
      'DontCallThreadRun',
      'StringInstantiation',
      'UseArraysAsList',
    ]);
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
    expect(moved.map(({ location }) => location.line)).toEqual(
      banned.map(({ location }) => location.line + 5),
    );
    expect(compareFindings({ baseFindings: banned, headFindings: moved }).newFindings).toEqual([]);
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
    expect(banned.every(({ message }) => message.includes('nitpicker.config.json'))).toBe(true);
  });
});
