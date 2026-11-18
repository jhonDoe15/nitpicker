import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { hostedToolSpawn } from '../host/client/host-tools.mts';
import { argumentFileToken } from './javac-options.mjs';
import { TEST_CATEGORIES, lintArguments } from './lint-arguments.mjs';
import {
  LINT_CACHE,
  LINT_FINGERPRINT,
  lintFingerprint,
  reusableWarnings,
} from './lint-baseline.mts';
import { lintedWarnings, relocated, hasUnreadWarnings } from './lint-output.mts';
import { posix, stageSources } from './lint-staging.mjs';
import { filesEndingWith } from '../../../../shared/filesystem.mjs';
import { callUntyped } from '../../adapters/typed/java-values.mts';
import { type LintPlan, lintPlanOf } from '../typed/lint-plan.mts';
import { fieldOf, fieldsOf, textOf, textsOf } from '../../../../shared/values/readers.mts';

type LintRun = { readonly reportDir: string; readonly baselineRoot?: string | undefined };
type LintFiles = { readonly report: string; readonly failure: string };
type SourceSet = { readonly baselineRoot: string | undefined; readonly files: LintFiles };
type Compiled = { readonly code: unknown; readonly log: string };
type Compile = {
  readonly plan: LintPlan;
  readonly work: string;
  readonly args: readonly string[];
  readonly files: readonly string[];
};
type LintSources = { readonly sources: readonly string[]; readonly modular: boolean };
type Reports = { readonly plan: LintPlan; readonly output: string; readonly fingerprint: string };
type Reused = {
  readonly baselineRoot: string | undefined;
  readonly all: string[];
  readonly fingerprint: string;
};

const MAIN_REPORT = 'javac-lint.txt';
const MAIN_FAILURE = 'javac-lint-failed.txt';
const TEST_REPORT = 'javac-lint-test.txt';
const TEST_FAILURE = 'javac-lint-test-failed.txt';
const TEST_LINT = 'test';
const UNREAD_WARNINGS = 'error: javac printed warnings in a form nitpicker cannot read';
const ENGLISH_OUTPUT = ['-J-Duser.language=en', '-J-Duser.country=US'];
const MODULE_INFO = 'module-info.java';
const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;
const LINT_TIMEOUT_MS = 15 * 60 * 1000;

function inside(directory: string, file: string): boolean {
  const relative = path.relative(directory, file);
  return !(relative.startsWith('..') || path.isAbsolute(relative));
}

function javaFilesIn(directories: readonly string[]): string[] {
  return textsOf(filesEndingWith(directories, '.java'));
}

function compileForLint({ plan, work, args, files }: Compile): Compiled {
  const argumentFile = path.join(work, 'javac.args');
  writeFileSync(
    argumentFile,
    [...args, ...files].map((token) => textOf(argumentFileToken(token))).join('\n'),
  );
  const result = callUntyped(
    plan['spawn'] ?? hostedToolSpawn,
    plan.javac,
    [...ENGLISH_OUTPUT, `@${argumentFile}`],
    { cwd: plan.basedir, encoding: 'utf8', maxBuffer: MAX_OUTPUT_BYTES, timeout: LINT_TIMEOUT_MS },
  );
  const error = fieldOf(result, 'error');
  if (error !== undefined) {
    throw error instanceof Error ? error : new Error(textOf(error));
  }
  const output = `${textOf(fieldOf(result, 'stdout'))}${textOf(fieldOf(result, 'stderr'))}`;
  return { code: fieldOf(result, 'status'), log: output };
}

function withUnreadWarnings(compiled: Compiled): Compiled {
  return compiled.code === 0 && hasUnreadWarnings(compiled.log)
    ? { code: 1, log: `${UNREAD_WARNINGS}\n${compiled.log}` }
    : compiled;
}

function compiledSources(
  plan: LintPlan,
  { sources, modular }: LintSources,
  work: string,
): Compiled & { staged: string } {
  const staged = path.join(work, 'sources');
  const classes = path.join(work, 'classes');
  mkdirSync(classes, { recursive: true });
  const listed = new Set(plan.sources);
  const stagedTree = stageSources({ root: plan.root, sources, staged });
  const files = [
    ...textsOf(fieldOf(stagedTree, 'files')),
    ...(modular ? javaFilesIn(plan.generatedSources).filter((file) => !listed.has(file)) : []),
  ];
  function compile(lookup: boolean | 'all'): Compiled {
    const args = textsOf(lintArguments(plan, { classes, modular: lookup }));
    return compileForLint({ plan, work, args, files });
  }
  const first = compile(modular);
  const compiled = first.code === 0 || !modular ? first : compile('all');
  return { ...withUnreadWarnings(compiled), staged: textOf(fieldOf(stagedTree, 'root')) };
}

function lintSources(plan: LintPlan, request: LintSources): Compiled {
  const work = plan.workDirectory;
  rmSync(work, { recursive: true, force: true });
  try {
    const result = compiledSources(plan, request, work);
    const context = {
      staged: result.staged,
      from: path.relative(plan.root, plan.basedir),
      to: textOf(posix(path.relative(plan.reportRoot, plan.basedir))),
    };
    const log: unknown =
      result.code === 0 ? lintedWarnings(result.log, context) : relocated(result.log, context);
    return { code: result.code, log: textOf(log) };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function writeReports({ plan, output, fingerprint }: Reports, text: string): void {
  writeFileSync(output, text);
  mkdirSync(plan.cacheDirectory, { recursive: true });
  writeFileSync(path.join(plan.cacheDirectory, LINT_CACHE), text);
  writeFileSync(path.join(plan.cacheDirectory, LINT_FINGERPRINT), fingerprint);
}

function clearReports(plan: LintPlan, files: LintFiles): void {
  const stale = [
    files.report,
    files.failure,
    path.join(plan.cacheDirectory, LINT_CACHE),
    path.join(plan.cacheDirectory, LINT_FINGERPRINT),
  ];
  for (const file of stale) {
    rmSync(file, { force: true });
  }
}

function lintedSources(plan: LintPlan): { moduleInfo: string | undefined; all: string[] } {
  const java = [...new Set(plan.sources)]
    .filter((file) => file.endsWith('.java') && inside(plan.root, file) && existsSync(file))
    .sort((left, right) => left.localeCompare(right));
  const moduleInfo = java.find((file) => path.basename(file) === MODULE_INFO);
  return {
    moduleInfo,
    all: java.filter((file) => file !== moduleInfo && inside(plan.basedir, file)),
  };
}

function reusedWarnings(
  plan: LintPlan,
  { baselineRoot, all, fingerprint }: Reused,
): { unchanged: ReadonlySet<unknown>; kept: string } {
  function reportPath(file: string): string {
    return textOf(posix(path.relative(plan.reportRoot, file)));
  }
  const reused = reusableWarnings(plan, { baselineRoot, sources: all, fingerprint, reportPath });
  const unchanged: unknown = fieldOf(reused, 'unchanged');
  return {
    unchanged: unchanged instanceof Set ? unchanged : new Set(),
    kept: textOf(fieldOf(reused, 'kept')),
  };
}

function lintSourceSet(plan: LintPlan, { baselineRoot, files }: SourceSet): void {
  clearReports(plan, files);
  const { moduleInfo, all } = lintedSources(plan);
  const fingerprint = textOf(lintFingerprint(plan));
  const { unchanged, kept } =
    moduleInfo === undefined
      ? reusedWarnings(plan, { baselineRoot, all, fingerprint })
      : { unchanged: new Set(), kept: '' };
  const sources = [
    ...all.filter((file) => !unchanged.has(file)),
    ...(moduleInfo === undefined ? [] : [moduleInfo]),
  ];
  const reports = { plan, output: files.report, fingerprint };
  if (sources.length === 0) {
    writeReports(reports, kept);
    return;
  }
  const result = lintSources(plan, { sources, modular: moduleInfo !== undefined });
  if (result.code === 0) {
    writeReports(reports, kept + result.log);
  } else {
    writeFileSync(files.failure, result.log);
  }
}

function testPlan(planValue: unknown): LintPlan {
  const { test, ...plan } = fieldsOf(planValue);
  return lintPlanOf({
    ...plan,
    ...fieldsOf(test),
    lintCategories: TEST_CATEGORIES,
    workDirectory: `${textOf(plan['workDirectory'])}-${TEST_LINT}`,
    cacheDirectory: path.join(textOf(plan['cacheDirectory']), TEST_LINT),
  });
}

export function runJavacLint(planValue: unknown, { reportDir, baselineRoot }: LintRun): void {
  const main = {
    report: path.join(reportDir, MAIN_REPORT),
    failure: path.join(reportDir, MAIN_FAILURE),
  };
  const test = {
    report: path.join(reportDir, TEST_REPORT),
    failure: path.join(reportDir, TEST_FAILURE),
  };
  lintSourceSet(lintPlanOf(planValue), { baselineRoot, files: main });
  const tests = testPlan(planValue);
  if (fieldOf(planValue, 'test') === undefined) {
    clearReports(tests, test);
    return;
  }
  lintSourceSet(tests, { baselineRoot, files: test });
}
