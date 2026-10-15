import { execFileSync } from 'node:child_process';

import path from 'node:path';

import { mkdirSync, writeFileSync, rmSync, mkdtempSync, cpSync, readFileSync } from 'node:fs';

import { tmpdir } from 'node:os';

import { runJavaDiff } from './java-diff.mjs';

import { describe, beforeAll, afterAll, it, expect } from 'vitest';

import {
  GREETER_TEST_WITHOUT_JAVA,
  BAD,
  FAREWELL,
  FAREWELL_TEST,
  LEGACY_WITH_COMMENT,
  DANGER,
  MAGIC_NUMBER_OFF_WITH_FORMATTING_RULESET,
  META,
  LABEL,
  LABEL_ONE_SIDED_TEST,
  SPREAD,
  SPREAD_TEST,
  OFFSET,
  GENERATED,
  GENERATED_TEST,
  BROKEN,
  WIDE,
  WIDE_TEST,
  GROWN,
  GROWN_TEST,
  classifier,
  stabilityFiles,
  WIDE_MOVED,
  GROWN_WIDER,
  GROWN_WIDER_TEST,
  DEEP,
  DEEP_TEST,
  TIERS,
  TIERS_TEST,
  COMBINE,
  COMBINE_TEST,
  FLATTEN,
  FLATTEN_TEST,
  PIPELINE,
  clonedClass,
  stabilityClass,
  ruleFixtures,
  HOSTILE_DETEKT_CONFIG,
  EXTRA_SOURCES,
} from './fixtures/kotlin-preset-data.mjs';

import { kotlinRuleCases, fixturePath } from './fixtures/kotlin-rules/cases.mjs';

import { SUPPRESSION_RULE } from './kotlin/rules/kotlin-rules.mjs';

import { analyzeJavaSnapshot } from './java-runner.mjs';

// End-to-end test of the Kotlin preset on a small mixed Kotlin and Java Gradle project. It needs
// Java 21, Gradle, lizard (see java-preset.e2e.test.mjs) and network access to Maven Central and
// the Gradle plugin portal (the Kotlin Gradle plugin, detekt, ktlint and ktfmt are downloaded on
// the first run), so it only runs with NITPICKER_KOTLIN_E2E=1 (`npm run test:kotlin`).
// NITPICKER_GRADLE overrides `gradle`. The script raises the test timeout to 15 minutes per step.

const enabled = process.env.NITPICKER_KOTLIN_E2E === '1';

const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';

const kotlinPolicy = { preset: 'kotlin' };

const kotlinSources = 'src/main/kotlin/demo';

const detektFindingsOf = (findings, testCase) =>
  findings.filter(
    ({ tool, path: file }) => tool === 'detekt' && file.includes(`/demo/${testCase.id}/`),
  );

let repository;

let mixedRepository;

let kotlinOnlyRepository;

function git(...args) {
  return execFileSync('git', args, {
    cwd: repository,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 'fixture',
      GIT_AUTHOR_EMAIL: 'fixture@example.com',
      GIT_COMMITTER_NAME: 'fixture',
      GIT_COMMITTER_EMAIL: 'fixture@example.com',
    },
  });
}

function writeAll(files) {
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(repository, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}

function commitBranch(name, files, removed = [], from = 'main') {
  git('checkout', '-q', '-b', name, from);
  writeAll(files);
  for (const relative of removed) {
    rmSync(path.join(repository, relative));
  }
  git('add', '-A');
  git('commit', '-q', '-m', name);
}

function commitFromStructureBase(name, files) {
  commitBranch(name, files, [], 'structure-base');
}

function initializeRepository() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-e2e-'));
  cpSync(path.resolve(import.meta.dirname, 'fixtures/kotlin-project'), root, { recursive: true });
  repository = root;
  writeAll({ '.gitignore': '/build/\n/.gradle/\n/.kotlin/\n' });
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('commit', '-q', '-m', 'base with one legacy detekt finding');
  return root;
}

const diffOf = (branch, policy = kotlinPolicy, base = 'main') => {
  git('checkout', '-q', branch);
  return runJavaDiff({ repositoryRoot: repository, requestedBaseRef: base, gradle, policy });
};

describe.skipIf(!enabled)('Kotlin preset end to end', () => {
  beforeAll(() => {
    kotlinOnlyRepository = initializeRepository();
    rmSync(path.join(kotlinOnlyRepository, 'src/main/java'), { recursive: true });
    writeAll({ 'src/test/kotlin/demo/GreeterTest.kt': GREETER_TEST_WITHOUT_JAVA });
    git('add', '-A');
    git('commit', '-q', '-m', 'Kotlin only');
    commitBranch('kotlin-only-violation', { [`${kotlinSources}/Bad.kt`]: BAD });
    mixedRepository = initializeRepository();
    commitBranch('clean', {
      [`${kotlinSources}/Farewell.kt`]: FAREWELL,
      'src/test/kotlin/demo/FarewellTest.kt': FAREWELL_TEST,
      [`${kotlinSources}/Legacy.kt`]: LEGACY_WITH_COMMENT,
    });
    commitBranch('violation', { [`${kotlinSources}/Bad.kt`]: BAD });
    commitBranch('java-in-kotlin-module', { 'src/main/java/demo/Danger.java': DANGER });
    commitBranch('detekt-config', {
      [`${kotlinSources}/Bad.kt`]: BAD,
      'config/detekt.yml': MAGIC_NUMBER_OFF_WITH_FORMATTING_RULESET,
    });
    commitBranch('no-formatter', { [`${kotlinSources}/Bad.kt`]: BAD }, ['.editorconfig']);
    commitBranch('ktfmt', { [`${kotlinSources}/Bad.kt`]: BAD, [`${kotlinSources}/Meta.kt`]: META });
    commitBranch('ktfmt-named', {
      'build.gradle.kts': `${readFileSync(path.join(repository, 'build.gradle.kts'), 'utf8')}\nval formatter = "com.ncorti.ktfmt.gradle"\n`,
    });
    commitBranch('one-sided-branch', {
      [`${kotlinSources}/Label.kt`]: LABEL,
      'src/test/kotlin/demo/LabelTest.kt': LABEL_ONE_SIDED_TEST,
    });
    commitBranch('multiline-branch', {
      [`${kotlinSources}/Spread.kt`]: SPREAD,
      'src/test/kotlin/demo/SpreadTest.kt': SPREAD_TEST,
      'src/main/kotlin/Offset.kt': OFFSET,
    });
    commitBranch('generated-branches', {
      [`${kotlinSources}/Generated.kt`]: GENERATED,
      'src/test/kotlin/demo/GeneratedTest.kt': GENERATED_TEST,
    });
    commitBranch('broken', { [`${kotlinSources}/Broken.kt`]: BROKEN });
    commitBranch('structure-base', {
      [`${kotlinSources}/Wide.kt`]: WIDE,
      'src/test/kotlin/demo/WideTest.kt': WIDE_TEST,
      [`${kotlinSources}/Grown.kt`]: GROWN,
      'src/test/kotlin/demo/GrownTest.kt': GROWN_TEST,
      [`${kotlinSources}/Complex.kt`]: classifier('classify', 9),
      [`${kotlinSources}/Complex2.kt`]: classifier('classify2', 9, { step: 7 }),
      ...stabilityFiles(''),
    });
    commitFromStructureBase('head', {
      [`${kotlinSources}/Wide.kt`]: WIDE_MOVED,
      [`${kotlinSources}/Grown.kt`]: GROWN_WIDER,
      'src/test/kotlin/demo/GrownTest.kt': GROWN_WIDER_TEST,
      [`${kotlinSources}/Complex.kt`]: classifier('classify', 9, { bump: 2 }),
      [`${kotlinSources}/Complex2.kt`]: classifier('classify2', 10, { step: 7 }),
      [`${kotlinSources}/Deep.kt`]: DEEP,
      'src/test/kotlin/demo/DeepTest.kt': DEEP_TEST,
      [`${kotlinSources}/Rank.kt`]: classifier('rank', 9, { step: 13 }),
      [`${kotlinSources}/Tiers.kt`]: TIERS,
      'src/test/kotlin/demo/TiersTest.kt': TIERS_TEST,
      [`${kotlinSources}/Combine.kt`]: COMBINE,
      'src/test/kotlin/demo/CombineTest.kt': COMBINE_TEST,
      'src/main/kotlin/Flatten.kt': FLATTEN,
      'src/test/kotlin/FlattenTest.kt': FLATTEN_TEST,
      [`${kotlinSources}/build/Pipeline.kt`]: PIPELINE,
      [`${kotlinSources}/Left.kt`]: clonedClass('Left'),
      [`${kotlinSources}/Right.kt`]: clonedClass('Right'),
      ...stabilityFiles('2'),
      'src/main/kotlin/stable/Core.kt': `${stabilityClass('stable', 'Core', 'churn.Volatile().value()')}\nval note = 1\n`,
    });
    commitBranch('one-way-banned', ruleFixtures('banned'));
    commitBranch('one-way-allowed', ruleFixtures('allowed'));
    commitBranch('one-way-hostile-config', {
      ...ruleFixtures('banned'),
      'config/detekt/detekt.yml': HOSTILE_DETEKT_CONFIG,
      ...Object.fromEntries(
        Object.entries(EXTRA_SOURCES).map(([name, text]) => [
          `src/main/kotlin/demo/extras/${name}`,
          text,
        ]),
      ),
    });
  });
  afterAll(() => {
    rmSync(mixedRepository, { recursive: true, force: true });
    rmSync(kotlinOnlyRepository, { recursive: true, force: true });
  });
  describe('one-way rules', () => {
    const results = new Map();
    const diffOnce = (branch) => {
      if (!results.has(branch)) {
        results.set(branch, diffOf(branch));
      }
      return results.get(branch);
    };
    it('does not report the suppressed finding twice: the suppression is the finding', () => {
      const result = diffOnce('one-way-banned');
      const suppression = kotlinRuleCases.find(({ rule }) => rule === SUPPRESSION_RULE);

      expect(detektFindingsOf(result.newEnforceable, suppression).map(({ rule }) => rule)).toEqual([
        SUPPRESSION_RULE,
      ]);
    });
    it('keeps every one-way rule on when the project config switches rulesets off, lowers severities or excludes paths, and still runs with plugin rulesets', () => {
      const result = diffOnce('one-way-hostile-config');
      const missing = kotlinRuleCases
        .filter(({ rule }) => rule !== SUPPRESSION_RULE)
        .filter(
          (testCase) =>
            !detektFindingsOf(result.newEnforceable, testCase).some(
              ({ rule }) => rule === testCase.rule,
            ),
        )
        .map(({ id }) => id);

      expect(missing).toEqual([]);
    });
    it('finds runBlocking behind a wildcard import and fully qualified, and does not ask a mutable holder class to become a data class', () => {
      const extras = diffOnce('one-way-hostile-config').newEnforceable.filter(({ path: file }) =>
        file.includes('/demo/extras/'),
      );

      expect(
        extras
          .filter(({ rule }) => rule === 'detekt.style.ForbiddenMethodCall')
          .map(({ path: file }) => path.basename(file))
          .sort(),
      ).toEqual(['Qualified.kt', 'Wildcard.kt']);
      expect(extras.some(({ rule }) => rule === 'detekt.style.UseDataClass')).toBe(false);
    });
    it('does not analyze a Kotlin script among the sources', () => {
      const result = diffOnce('one-way-hostile-config');

      expect(result.newFindings.some(({ path: file }) => file.endsWith('.kts'))).toBe(false);
      expect(result.newFindings.some(({ rule }) => rule === 'gradle-failure')).toBe(false);
    });
    it('reports the suppressions that hide a detekt or ktlint rule, however they are written, and leaves compiler warnings alone', () => {
      const result = diffOnce('one-way-hostile-config');

      const suppressions = result.newEnforceable
        .filter(({ rule, path: file }) => rule === SUPPRESSION_RULE && file.includes('/extras/'))
        .map(({ path: file, identity }) => `${path.basename(file)} ${identity}`);

      expect(suppressions.toSorted()).toEqual([
        'Hidden.kt suppress:UnsafeCallOnNullableType',
        'Hidden.kt suppress:ktlint:standard:indent',
      ]);
    });
    it('lifts a rule for the paths of an exception in nitpicker.config.json only', () => {
      git('checkout', '-q', 'one-way-banned');
      const exception = (testCase) => ({
        rule: testCase.rule,
        glob: fixturePath(testCase, 'banned'),
      });
      const [scopeRun, scopeWith] = ['scopeRun', 'scopeWith'].map((id) =>
        kotlinRuleCases.find((testCase) => testCase.id === id),
      );
      const result = runJavaDiff({
        repositoryRoot: repository,
        requestedBaseRef: 'main',
        gradle,
        policy: { ...kotlinPolicy, exceptions: [exception(scopeRun)] },
      });

      expect(detektFindingsOf(result.newEnforceable, scopeRun)).toEqual([]);
      expect(detektFindingsOf(result.newEnforceable, scopeWith)).toHaveLength(1);
    });
  });
  it('reports a Gradle failure as a tool error instead of throwing', () => {
    git('checkout', '-q', 'broken');

    const { findings } = analyzeJavaSnapshot(repository, { gradle, policy: kotlinPolicy });

    expect(
      findings.map(({ tool, rule, classification, message }) => ({
        tool,
        rule,
        classification,
        namesTheBrokenFile: message.includes('Broken.kt'),
      })),
    ).toEqual([
      {
        tool: 'kotlin',
        rule: 'gradle-failure',
        classification: 'tool-error',
        namesTheBrokenFile: true,
      },
    ]);
  });
});
