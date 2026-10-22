import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ingestSarifText } from '../../../../../../shared/ingest/sarif.mjs';
import { applyFindingPolicy } from '../../../../../../shared/findings/finding-policy.mjs';
import { compareFindings } from '../../../../../../core/diff/comparison/compare.mjs';
import { applyRuleMessages } from '../../../../messages/rule-messages.mjs';
import { INIT_SCRIPT } from '../../../../builds/java-build.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const fixtures = path.resolve(import.meta.dirname, '../../fixtures/pmd-categories');
const ruleset = path.resolve(import.meta.dirname, '../../../../gradle/pmd-ruleset.xml');
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

function prepare() {
  root = mkdtempSync(path.join(tmpdir(), 'nitpicker-pmd-categories-'));
  const version = /^\s*pmd\s*:\s*'([^']+)'/mu.exec(readFileSync(INIT_SCRIPT, 'utf8'))[1];
  writeFileSync(path.join(root, 'settings.gradle'), "rootProject.name = 'pmd-categories'\n");
  writeFileSync(
    path.join(root, 'build.gradle'),
    `plugins { id 'java' }
repositories { mavenCentral() }
configurations { probe }
dependencies {
  probe 'net.sourceforge.pmd:pmd-cli:${version}'
  probe 'net.sourceforge.pmd:pmd-java:${version}'
}
tasks.register('pmdProbe', JavaExec) {
  classpath = configurations.probe
  mainClass = 'net.sourceforge.pmd.cli.PmdCli'
  args 'check', '--no-cache', '--no-progress', '--format', 'sarif',
    '--report-file', 'pmd.sarif', '--dir', 'src', '--rulesets', ${JSON.stringify(ruleset)}
  ignoreExitValue = true
}
`,
  );
  for (const role of ['main', 'test']) {
    const directory = path.join(root, 'src', role, 'java/demo');
    mkdirSync(directory, { recursive: true });
    cpSync(fixtures, directory, { recursive: true });
  }
}

function readFindings() {
  const report = readFileSync(path.join(root, 'pmd.sarif'), 'utf8');
  return applyRuleMessages(ingestSarifText(report, { tool: 'pmd', root }).findings);
}

function runPmd() {
  const result = spawnSync(gradle, ['--console=plain', '--quiet', 'pmdProbe'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 180_000,
  });
  expect({ status: result.status, signal: result.signal, error: result.error }).toEqual({
    status: 0,
    signal: null,
    error: undefined,
  });
}

describe.skipIf(!enabled)('pinned PMD additional categories', () => {
  beforeAll(() => {
    prepare();
    runPmd();
    findings = readFindings();
    for (const role of ['main', 'test']) {
      const file = path.join(root, 'src', role, 'java/demo/Banned.java');
      writeFileSync(file, `\n\n\n\n\n${readFileSync(file, 'utf8')}`);
    }
    runPmd();
    shifted = readFindings();
  });

  afterAll(() => {
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
  });

  it.each(['main', 'test'])('runs all three categories on %s sources', (role) => {
    expect(
      findings
        .filter((finding) => finding.path === `src/${role}/java/demo/Banned.java`)
        .filter((finding) => categories.has(finding.rule))
        .map(({ rule }) => rule)
        .sort(),
    ).toEqual([
      'AvoidFileStream',
      'DontCallThreadRun',
      'HardCodedCryptoKey',
      'InsecureCryptoIv',
      'StringInstantiation',
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
