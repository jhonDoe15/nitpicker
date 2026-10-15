import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { writeFileSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import {
  LEGACY,
  BRANCHY,
  WIDE,
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
  WIDE_EXTENDED,
  WIDE_REFORMATTED,
  STABILITY_FILES,
  stabilityClass,
  repeated,
} from './test-support/java-preset-data.mjs';
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

function git(...args) {
  runGitIn(repository, ...args);
}

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
  'spotbugs UUF_UNUSED_FIELD Legacy.java',
  'structure function-parameters-limit Wide.java',
];

const BASELINED_FINDINGS_WITHOUT_GREETER_LINE_COVERAGE = [
  'coupling coupling .',
  'coupling module-coupling Branchy.java',
  'coupling module-coupling Greeter.java',
  'coupling module-coupling Legacy.java',
  'coupling module-coupling Wide.java',
  'coupling package-coupling .',
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
  'spotbugs UUF_UNUSED_FIELD Legacy.java',
  'structure function-parameters-limit Wide.java',
];

const CHECKSTYLE_PREFIX = 'com.puppycrawl.tools.checkstyle.checks.';

const CHECKSTYLE_ON_BAD = [
  'blocks.EmptyCatchBlockCheck',
  'indentation.IndentationCheck',
  'regexp.RegexpSinglelineJavaCheck',
  'whitespace.EmptyLineSeparatorCheck',
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
    git('init', '-q', '-b', 'main');
    git('add', '-A');
    git('commit', '-q', '-m', 'base with one legacy violation');
    branchWith('clean', {
      'Greeter.java': FAREWELL,
      'src/test/java/demo/GreeterTest.java': GREETER_TEST,
    });
    branchWith('moved', { 'Legacy.java': LEGACY_MOVED });
    branchWith('violation', { 'Bad.java': BAD });
    branchWith('architecture', { 'Stamp.java': STAMP });
    branchWith('complex', { 'Complex.java': COMPLEX });
    branchWith('clone', { 'Left.java': clonedClass('Left'), 'Right.java': clonedClass('Right') });
    branchWith('survivor', { 'Calc.java': CALC, 'src/test/java/demo/CalcTest.java': CALC_TEST });
    branchWith('branch-moved', { 'Branchy.java': BRANCHY_MOVED });
    branchWith('branch-edited', { 'Branchy.java': BRANCHY_EDITED });
    branchWith('branch-added', { 'Branchy.java': BRANCHY_ADDED });
    branchWith('structure-new', { 'Wide.java': WIDE_EXTENDED });
    branchWith('structure-moved', { 'Wide.java': WIDE_REFORMATTED });
    // --- coupling (SH6) branches ---
    branchWith('stability', STABILITY_FILES);
    git('checkout', '-q', '-b', 'stability-edited', 'stability');
    writeFileSync(
      path.join(repository, 'src/main/java/stable/Core.java'),
      stabilityClass(
        'stable',
        'Core',
        '  // Delegates to the volatile package.\n  public int value() {\n    return new churn.Volatile().value();\n  }',
      ),
    );
    git('add', '-A');
    git('commit', '-q', '-m', 'stability-edited');
    // --- end coupling branches ---
  });

  afterAll(() => {
    spawnSync(gradle, ['--stop'], { stdio: 'ignore' });
    rmSync(repository, { recursive: true, force: true });
  });

  const diffOf = (branch, policy) => {
    git('checkout', '-q', branch);
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
    'fails new PMD, SpotBugs, Checkstyle and formatter violations, and untested code, as new',
    () => {
      const result = diffOf('violation');

      expect(result.failed).toBe(true);
      expect(summarize(result.newEnforceable)).toEqual([
        ...CHECKSTYLE_ON_BAD.map((check) => `checkstyle ${CHECKSTYLE_PREFIX}${check} Bad.java`),
        'google-java-format format Bad.java',
        'pit mutant-nocoverage Bad.java', // Bad.decode has no test
        'pmd EmptyCatchBlock Bad.java',
        'spotbugs DM_DEFAULT_ENCODING Bad.java',
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
        'archunit no_classes_use_legacy_date Stamp.java',
        'archunit no_classes_use_legacy_date Stamp.java',
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
      expect(summarize(survivor.newEnforceable)).toEqual(['pit mutant-survived Calc.java']);
      expect(survivor.newEnforceable.find((finding) => finding.tool === 'pit').message).toEqual(
        'Survived ConditionalsBoundaryMutator: changed conditional boundary: no test fails when this code changes. Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears.',
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
    'names the method of an uncovered branch and accepts it with an exception that names the method',
    () => {
      const failing = diffOf('branch-edited');
      const accepted = diffOf('branch-edited', {
        exceptions: [
          {
            rule: 'changed-branch-coverage',
            paths: ['src/main/java/demo/Branchy.java'],
            function: 'Branchy.larger',
          },
        ],
      });
      const other = diffOf('branch-edited', {
        exceptions: [
          {
            rule: 'changed-branch-coverage',
            paths: ['src/main/java/demo/Branchy.java'],
            function: 'Branchy.smaller',
          },
        ],
      });

      expect(failing.newEnforceable.map(({ message }) => message)).toEqual([
        'Branch coverage is 0.00%; minimum is 95%. If a reviewer agrees this is intended, add {"rule":"changed-branch-coverage","paths":["src/main/java/demo/Branchy.java"],"function":"Branchy.larger","reason":"<why this is intended>"} to "exceptions" in nitpicker.config.json.',
      ]);
      expect(accepted.failed).toBe(false);
      expect(summarize(accepted.newEnforceable)).toEqual([]);
      expect(other.failed).toBe(true);
    },
    GRADLE_STEP_TIMEOUT_MS * 3,
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
      ]);
      expect(result.newEnforceable.find((finding) => finding.tool === 'structure').message).toBe(
        'Wide.deep nests control flow 3 deep (limit 2). Return early instead of nesting. If a reviewer agrees this is intended, add {"rule":"function-control-nesting-limit","paths":["src/main/java/demo/Wide.java"],"function":"Wide.deep","reason":"<why this is intended>"} to "exceptions" in nitpicker.config.json.',
      );
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
          message:
            'stable depends on less stable package churn. If a reviewer agrees this is intended, add {"rule":"stability-direction","paths":["stable"],"reason":"<why this is intended>"} to "exceptions" in nitpicker.config.json.',
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
      git('checkout', '-q', 'stability-edited');
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
