import path from 'node:path';
import { writeFileSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import { beforeAll, afterAll } from 'vitest';
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
  PALANTIR_MESSY,
  PALANTIR_ROOMY,
} from '../test-support/java-preset-data.mts';
import { textOf } from '../../../../../shared/values/readers.mts';
import { UNITS, UNITS_TEST } from '../test-support/unit-sources.mts';
import { DOMAIN_FILES, FEATURE_FILES } from '../test-support/boundaries/feature-sources.mts';
import {
  WIDE,
  WIDE_EXTENDED,
  WIDE_REFORMATTED,
  pricingClass,
} from '../test-support/wide-sources.mts';
import { findingsOf, type JavaFinding, type JavaPolicy } from '../../typed/java-values.mts';
import { runJavaDiff } from '../../java-diff.mts';
import { schemaChecked } from '../../../../../core/diff/comparison/test-support/findings-schema-check.mts';
import { commitBranch, runGitIn } from '../../test-support/gradle-e2e.mts';

const enabled = process.env['NITPICKER_JAVA_E2E'] === '1';
const gradle = process.env['NITPICKER_GRADLE'] ?? 'gradle';
let repository: string;
const sourceDirectory = 'src/main/java/demo';
function branchWith(name: string, files: Readonly<Record<string, string>>): void {
  const rooted = Object.entries(files).map(([file, content]): [string, string] => [
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
  'pmd UnusedPrivateField Legacy.java',
  'structure function-parameters-limit Wide.java',
  'test-runtime category-count .',
  'test-runtime test-runtime .',
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
  'pit mutant-nocoverage Greeter.java',
  'pmd UnusedPrivateField Legacy.java',
  'structure function-parameters-limit Wide.java',
  'test-runtime category-count .',
  'test-runtime test-runtime .',
];
type DiffOutcome = ReturnType<typeof runJavaDiff> & {
  readonly unchangedFindings: readonly JavaFinding[];
};

export function useJavaPresetProject(): {
  readonly diffOf: (branch: string, policy?: JavaPolicy) => DiffOutcome;
  readonly structureOf: (findings: readonly JavaFinding[]) => string[];
} {
  beforeAll(() => {
    repository = mkdtempSync(path.join(tmpdir(), 'nitpicker-java-e2e-'));
    cpSync(
      path.resolve(path.resolve(import.meta.dirname, '..'), '../fixtures/gradle-project'),
      repository,
      {
        recursive: true,
      },
    );
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
    branchWith('near-copy', {
      'OrderPricing.java': pricingClass('OrderPricing', 'orders'),
      'InvoicePricing.java': pricingClass('InvoicePricing', 'invoices'),
    });
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
    branchWith('features', FEATURE_FILES);
    branchWith('domain', DOMAIN_FILES);
  });
  afterAll(() => {
    rmSync(repository, { recursive: true, force: true });
  });
  const diffOf = (branch: string, policy?: JavaPolicy): DiffOutcome => {
    runGitIn(repository, 'checkout', '-q', branch);
    const outcome = schemaChecked(
      runJavaDiff({ repositoryRoot: repository, requestedBaseRef: 'main', gradle, policy }),
    );
    return { ...outcome, unchangedFindings: findingsOf(outcome['unchangedFindings']) };
  };
  const structureOf = (findings: readonly JavaFinding[]): string[] =>
    findings
      .filter((finding) => finding.tool === 'structure')
      .map(({ rule, symbol }) => `${rule} ${textOf(symbol)}`);
  return {
    get diffOf() {
      return diffOf;
    },
    get structureOf() {
      return structureOf;
    },
  };
}
export {
  enabled,
  gradle,
  repository,
  sourceDirectory,
  BASELINED_FINDINGS,
  BASELINED_FINDINGS_WITHOUT_GREETER_LINE_COVERAGE,
};
