import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { writeFileSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import {
  LEGACY,
  BRANCHY,
  FAREWELL,
  GREETER_TEST,
  LEGACY_MOVED,
  BAD,
  STAMP,
  COMPLEX,
  clonedClass,
  CALC,
  CALC_TEST,
  BRANCHY_MOVED,
  BRANCHY_EDITED,
  BRANCHY_ADDED,
  STABILITY_FILES,
  stabilityClass,
  repeated,
  PALANTIR_MESSY,
  PALANTIR_ROOMY,
} from './test-support/java-preset-data.mjs';
import { UNITS, UNITS_TEST } from './test-support/unit-sources.mjs';
import { WIDE, WIDE_EXTENDED, WIDE_REFORMATTED } from './test-support/wide-sources.mjs';
import { runJavaDiff } from '../java-diff.mjs';
import {
  commitBranch,
  GRADLE_STEP_TIMEOUT_MS,
  runGitIn,
  summarize,
} from '../test-support/gradle-e2e.mjs';

// End-to-end test of the Java preset on a tiny Gradle project. It needs Java 21, Gradle and network
// access to Maven Central (first run downloads PMD, SpotBugs, google-java-format, JaCoCo and Checkstyle), so it
// only runs with NITPICKER_JAVA_E2E=1 (`npm run test:java`). NITPICKER_GRADLE overrides `gradle`.

const enabled = process.env.NITPICKER_JAVA_E2E === '1';

const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';

let repository;

const sourceDirectory = 'src/main/java/demo';

function branchWith(name, files) {
  const rooted = Object.entries(files).map(([file, content]) => [
    file.includes('/') ? file : path.join(sourceDirectory, file),
    content,
  ]);
  commitBranch(repository, name, Object.fromEntries(rooted));
}

const BASELINED_FINDINGS = [
  'coupling coupling .',
  'coupling module-coupling Branchy.java',
  'coupling module-coupling Greeter.java',
  'coupling module-coupling Legacy.java',
  'coupling module-coupling Wide.java',
  'coupling package-coupling .',
  'coupling test-only-export Greeter.java',
  'errorprone UnnecessarilyFullyQualified Greeter.java',
  'jacoco changed-branch-coverage Branchy.java',
  'jacoco line-coverage Branchy.java',
  'jacoco line-coverage Greeter.java',
  'jacoco line-coverage Legacy.java',
  'jacoco line-coverage Wide.java',
  'jacoco uncovered-method Branchy.java',
  'jacoco uncovered-method Greeter.java',
  'jacoco uncovered-method Legacy.java',
  'jacoco uncovered-method Wide.java',
  'pit mutant-nocoverage Branchy.java',
  'pit mutant-nocoverage Greeter.java',
  'pit mutant-nocoverage Legacy.java',
  'pit mutant-nocoverage Wide.java',
  'pit mutation-summary .',
  'pmd UnusedPrivateField Legacy.java',
  'structure function-parameters-limit Wide.java',
];

const BASELINED_FINDINGS_WITHOUT_GREETER_LINE_COVERAGE = [
  'coupling coupling .',
  'coupling module-coupling Branchy.java',
  'coupling module-coupling Greeter.java',
  'coupling module-coupling Legacy.java',
  'coupling module-coupling Wide.java',
  'coupling package-coupling .',
  'coupling test-only-export Greeter.java',
  'errorprone UnnecessarilyFullyQualified Greeter.java',
  'jacoco changed-branch-coverage Branchy.java',
  'jacoco line-coverage Branchy.java',
  'jacoco line-coverage Legacy.java',
  'jacoco line-coverage Wide.java',
  'jacoco uncovered-method Branchy.java',
  'jacoco uncovered-method Greeter.java',
  'jacoco uncovered-method Legacy.java',
  'jacoco uncovered-method Wide.java',
  'pit mutant-nocoverage Branchy.java',
  'pit mutant-nocoverage Greeter.java',
  'pit mutant-nocoverage Legacy.java',
  'pit mutant-nocoverage Wide.java',
  'pit mutation-summary .',
  'pmd UnusedPrivateField Legacy.java',
  'structure function-parameters-limit Wide.java',
];

describe.skipIf(!enabled)('Java preset end to end', () => {
  beforeAll(() => {
    repository = mkdtempSync(path.join(tmpdir(), 'nitpicker-java-e2e-'));
    cpSync(path.resolve(import.meta.dirname, '../fixtures/gradle-project'), repository, {
      recursive: true,
    });
    writeFileSync(path.join(repository, '.gitignore'), 'build/\n.gradle/\n');
    writeFileSync(path.join(repository, sourceDirectory, 'Legacy.java'), LEGACY);
    writeFileSync(path.join(repository, sourceDirectory, 'Branchy.java'), BRANCHY);
    writeFileSync(path.join(repository, sourceDirectory, 'Wide.java'), WIDE);
    runGitIn(repository, 'init', '-q', '-b', 'main');
    runGitIn(repository, 'add', '-A');
    runGitIn(repository, 'commit', '-q', '-m', 'base with one legacy violation');
    branchWith('clean', {
      'Greeter.java': FAREWELL,
      'src/test/java/demo/GreeterTest.java': GREETER_TEST,
    });
    branchWith('moved', { 'Legacy.java': LEGACY_MOVED });
    branchWith('violation', { 'Bad.java': BAD });
    branchWith('architecture', { 'Stamp.java': STAMP });
    branchWith('complex', { 'Complex.java': COMPLEX });
    branchWith('units', { 'Units.java': UNITS, 'src/test/java/demo/UnitsTest.java': UNITS_TEST });
    branchWith('palantir', { 'Messy.java': PALANTIR_MESSY, 'Roomy.java': PALANTIR_ROOMY });
    branchWith('clone', { 'Left.java': clonedClass('Left'), 'Right.java': clonedClass('Right') });
    branchWith('survivor', { 'Calc.java': CALC, 'src/test/java/demo/CalcTest.java': CALC_TEST });
    branchWith('branch-moved', { 'Branchy.java': BRANCHY_MOVED });
    branchWith('branch-edited', { 'Branchy.java': BRANCHY_EDITED });
    branchWith('branch-added', { 'Branchy.java': BRANCHY_ADDED });
    branchWith('structure-new', { 'Wide.java': WIDE_EXTENDED });
    branchWith('structure-moved', { 'Wide.java': WIDE_REFORMATTED });
    // --- coupling (SH6) branches ---
    branchWith('stability', STABILITY_FILES);
    runGitIn(repository, 'checkout', '-q', '-b', 'stability-edited', 'stability');
    writeFileSync(
      path.join(repository, 'src/main/java/stable/Core.java'),
      stabilityClass(
        'stable',
        'Core',
        '  // Delegates to the volatile package.\n  public int value() {\n    return new churn.Volatile().value();\n  }',
      ),
    );
    runGitIn(repository, 'add', '-A');
    runGitIn(repository, 'commit', '-q', '-m', 'stability-edited');
    // --- end coupling branches ---
  });

  afterAll(() => {
    spawnSync(gradle, ['--stop'], { stdio: 'ignore' });
    rmSync(repository, { recursive: true, force: true });
  });

  const diffOf = (branch, policy) => {
    runGitIn(repository, 'checkout', '-q', branch);
    return runJavaDiff({ repositoryRoot: repository, requestedBaseRef: 'main', gradle, policy });
  };

  it(
    'passes a clean change and reports the baselined legacy violations as unchanged',
    () => {
      const result = diffOf('clean');

      expect(result.failed).toBe(false);
      expect(summarize(result.newEnforceable)).toEqual([]);
      expect([...new Set(summarize(result.unchangedFindings))].sort()).toEqual(
        BASELINED_FINDINGS_WITHOUT_GREETER_LINE_COVERAGE,
      );
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'keeps a violation baselined when its line moves',
    () => {
      const result = diffOf('moved');

      expect(result.failed).toBe(false);
      expect(summarize(result.newFindings.filter((finding) => finding.tool !== 'jacoco'))).toEqual(
        [],
      );
      expect([...new Set(summarize(result.unchangedFindings))].sort()).toEqual(BASELINED_FINDINGS);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'fails new Error Prone and formatter violations, and untested code, as new, each issue once',
    () => {
      const result = diffOf('violation');

      expect(result.failed).toBe(true);
      expect(summarize(result.newEnforceable)).toEqual([
        'errorprone DefaultCharset Bad.java',
        'errorprone EmptyCatch Bad.java',
        'google-java-format format Bad.java',
        'pit mutant-nocoverage Bad.java', // Bad.decode has no test
      ]);
      expect([...new Set(summarize(result.unchangedFindings))].sort()).toEqual(BASELINED_FINDINGS);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'fails a new ArchUnit violation, once per rule and offending class',
    () => {
      const result = diffOf('architecture');

      expect(result.failed).toBe(true);
      expect(summarize(result.newEnforceable)).toEqual([
        ...repeated(2, 'archunit no_classes_use_legacy_date Stamp.java'),
        ...repeated(4, 'errorprone JavaUtilDate Stamp.java'),
        ...repeated(3, 'pit mutant-nocoverage Stamp.java'),
      ]);
      expect(
        result.newEnforceable
          .filter((finding) => finding.tool === 'archunit')
          .map((finding) => finding.identity)
          .sort(),
      ).toEqual(['demo.Stamp', 'demo.Stamp$Inner']);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'fails a new method over the CRAP limit',
    () => {
      const result = diffOf('complex');

      expect(result.failed).toBe(true);
      expect(summarize(result.newEnforceable)).toEqual([
        'crap crap-score-limit Complex.java',
        ...repeated(9, 'jacoco changed-branch-coverage Complex.java'),
        ...repeated(28, 'pit mutant-nocoverage Complex.java'),
        'structure function-statements-limit Complex.java', // the method has more than 15 statements
      ]);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'scores a lambda by its synthetic method and an initializer block by its lines, each as a unit of its own',
    () => {
      const result = diffOf('units');
      const scored = result.newEnforceable.filter(({ tool }) => tool === 'crap');

      expect(scored.map(({ rule, symbol }) => `${rule} ${symbol}`).sort()).toEqual([
        'crap-score-limit Units.<init>',
        'crap-score-limit Units.total.<lambda>',
      ]);
      expect(result.newEnforceable.filter(({ tool }) => tool === 'structure')).toEqual([]);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'honours thresholds.crapLimit: a high limit lets the complex method pass the CRAP rule',
    () => {
      const result = diffOf('complex', { crapLimit: 1_000_000 });

      expect(summarize(result.newEnforceable)).not.toContain('crap crap-score-limit Complex.java');
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'honours exclude: findings under an excluded path are dropped',
    () => {
      const result = diffOf('violation', { exclude: [`${sourceDirectory}/Bad.java`] });

      expect(result.failed).toBe(false);
      expect(result.newFindings.some((finding) => finding.path.endsWith('Bad.java'))).toBe(false);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'with palantir declared, fails a new badly formatted file and lets a 108-column line pass',
    () => {
      const conventions = {
        'java.formatter': 'palantir',
        'java.indentation': '4',
        'java.lineLength': '120',
      };
      const result = diffOf('palantir', { javaStyle: 'palantir', conventions });
      const style = (findings) =>
        summarize(
          findings.filter(
            ({ tool, rule }) => tool === 'palantir-java-format' || rule === 'line-length-limit',
          ),
        );

      expect(style(result.newEnforceable)).toEqual(['palantir-java-format format Messy.java']);
      expect(style(result.newFindings)).toEqual(['palantir-java-format format Messy.java']);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'fails a new clone found by jscpd',
    () => {
      const result = diffOf('clone');

      expect(result.failed).toBe(true);
      expect(
        summarize(result.newEnforceable.filter((finding) => finding.tool === 'duplicates')),
      ).toEqual(['duplicates duplicate-clone Left.java']);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'fails a new surviving mutant in changed code',
    () => {
      const survivor = diffOf('survivor');

      expect(survivor.failed).toBe(true);
      expect(summarize(survivor.newEnforceable)).toEqual([
        'coupling test-only-export Calc.java',
        'pit mutant-survived Calc.java',
      ]);
      expect(survivor.newEnforceable.find((finding) => finding.tool === 'pit').message).toEqual(
        'Survived ConditionalsBoundaryMutator: changed conditional boundary: no test fails when this code changes. Add an assertion that would. If no input can tell the two apart (a compareTo boundary, a discarded lambda return), simplify the code so this mutant disappears, or add an exception for pit/mutant-survived in nitpicker.config.json.',
      );
      // The legacy uncovered mutants (Greeter.shout, Legacy.value) stay baselined.
      expect([...new Set(summarize(survivor.unchangedFindings))].sort()).toEqual(
        BASELINED_FINDINGS,
      );
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'baselines an uncovered branch whose line only moves',
    () => {
      const result = diffOf('branch-moved');

      expect(result.failed).toBe(false);
      expect(summarize(result.newEnforceable)).toEqual([]);
      expect([...new Set(summarize(result.unchangedFindings))].sort()).toEqual(BASELINED_FINDINGS);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'fails an uncovered branch on a changed line',
    () => {
      const result = diffOf('branch-edited');

      expect(result.failed).toBe(true);
      expect(summarize(result.newEnforceable)).toEqual([
        'jacoco changed-branch-coverage Branchy.java',
      ]);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'fails a new uncovered branch and keeps the old one baselined',
    () => {
      const result = diffOf('branch-added');

      expect(result.failed).toBe(true);
      expect(summarize(result.newEnforceable)).toEqual([
        'jacoco changed-branch-coverage Branchy.java',
        ...repeated(4, 'pit mutant-nocoverage Branchy.java'),
      ]);
      expect([...new Set(summarize(result.unchangedFindings))].sort()).toEqual(BASELINED_FINDINGS);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  // SH5: the shared structure rule on Java methods.
  const structureOf = (findings) =>
    findings
      .filter((finding) => finding.tool === 'structure')
      .map(({ rule, symbol }) => `${rule} ${symbol}`);

  it(
    'fails a new method over the nesting limit and keeps the legacy wide method baselined',
    () => {
      const result = diffOf('structure-new');

      expect(result.failed).toBe(true);
      expect(structureOf(result.newEnforceable)).toEqual([
        'function-control-nesting-limit Wide.deep',
        'function-control-nesting-limit Wide.nested',
      ]);
      expect(
        result.newEnforceable
          .filter((finding) => finding.tool === 'structure')
          .map(({ message }) => message),
      ).toEqual([
        'Wide.deep nests control flow 3 deep (limit 2). Return early instead of nesting.',
        'Wide.nested nests control flow 3 deep (limit 2). Return early instead of nesting.',
      ]);
      expect(structureOf(result.unchangedFindings)).toEqual(['function-parameters-limit Wide.sum']);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  // --- coupling (SH6) cases ---
  it(
    'fails a package depending on a less stable package and reports coupling metrics as descriptive',
    () => {
      const result = diffOf('stability');

      expect(result.failed).toBe(true);
      const coupling = (findings) => findings.filter((finding) => finding.tool === 'coupling');
      expect(
        coupling(result.newEnforceable).map(({ rule, identity, message }) => ({
          rule,
          identity,
          message,
        })),
      ).toEqual([
        {
          rule: 'stability-direction',
          identity: 'package-edge:stable->churn',
          message: 'stable depends on less stable package churn',
        },
      ]);
      const metrics = coupling(result.newFindings).filter(
        (finding) => finding.classification === 'descriptive',
      );
      expect(
        metrics.find((finding) => finding.identity === 'package:stable:instability').metric,
      ).toEqual({ name: 'instability', value: 0.3333 });
      expect(
        metrics.find((finding) => finding.identity === 'package:churn:instability').metric,
      ).toEqual({ name: 'instability', value: 0.5 });
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'keeps a method over the parameter limit baselined when its line moves',
    () => {
      const result = diffOf('structure-moved');

      expect(structureOf(result.newFindings)).toEqual([]);
      expect(structureOf(result.unchangedFindings)).toEqual(['function-parameters-limit Wide.sum']);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'keeps an existing stability-direction violation baselined when the package is edited',
    () => {
      runGitIn(repository, 'checkout', '-q', 'stability-edited');
      const result = runJavaDiff({
        repositoryRoot: repository,
        requestedBaseRef: 'stability',
        gradle,
      });

      expect(result.newFindings.filter((finding) => finding.tool === 'coupling')).toEqual([]);
      expect(
        result.unchangedFindings
          .filter((finding) => finding.rule === 'stability-direction')
          .map((finding) => finding.identity),
      ).toEqual(['package-edge:stable->churn']);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );
  // --- end coupling cases ---
});
