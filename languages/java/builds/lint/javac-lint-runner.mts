import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { argumentFileToken } from './javac-options.mjs';
import { lintArguments } from './lint-arguments.mjs';
import {
  LINT_CACHE,
  LINT_FINGERPRINT,
  lintFingerprint,
  reusableWarnings,
} from './lint-baseline.mjs';
import { lintedWarnings, relocated, hasUnreadWarnings } from './lint-output.mjs';
import { posix, stageSources } from './lint-staging.mjs';
import { callUntyped } from '../../adapters/typed/java-values.mts';
import { fieldOf, fieldsOf, textOf, textsOf } from '../../../../shared/values/readers.mts';

type LintPlan = Readonly<Record<string, unknown>> & {
  readonly root: string;
  readonly basedir: string;
  readonly reportRoot: string;
  readonly sources: readonly string[];
  readonly generatedSources: readonly string[];
  readonly javac: string;
  readonly workDirectory: string;
  readonly cacheDirectory: string;
};
type LintRun = { readonly reportDir: string; readonly baselineRoot?: unknown };
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
  readonly baselineRoot: unknown;
  readonly all: string[];
  readonly fingerprint: string;
};

const LINT_REPORT = 'javac-lint.txt';
const LINT_FAILURE = 'javac-lint-failed.txt';
const UNREAD_WARNINGS = 'error: javac printed warnings in a form nitpicker cannot read';
const ENGLISH_OUTPUT = ['-J-Duser.language=en', '-J-Duser.country=US'];
const MODULE_INFO = 'module-info.java';
const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;
const LINT_TIMEOUT_MS = 15 * 60 * 1000;

function lintPlanOf(value: unknown): LintPlan {
  return {
    ...fieldsOf(value),
    root: textOf(fieldOf(value, 'root')),
    basedir: textOf(fieldOf(value, 'basedir')),
    reportRoot: textOf(fieldOf(value, 'reportRoot')),
    sources: textsOf(fieldOf(value, 'sources')),
    generatedSources: textsOf(fieldOf(value, 'generatedSources')),
    javac: textOf(fieldOf(value, 'javac')),
    workDirectory: textOf(fieldOf(value, 'workDirectory')),
    cacheDirectory: textOf(fieldOf(value, 'cacheDirectory')),
  };
}

function inside(directory: string, file: string): boolean {
  const relative = path.relative(directory, file);
  return !(relative.startsWith('..') || path.isAbsolute(relative));
}

function generatedFiles(directories: readonly string[]): string[] {
  return directories
    .filter((directory) => existsSync(directory))
    .flatMap((directory) =>
      readdirSync(directory, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.java'))
        .map((entry) => path.join(entry.parentPath, entry.name)),
    )
    .sort();
}

function compileForLint({ plan, work, args, files }: Compile): Compiled {
  const argumentFile = path.join(work, 'javac.args');
  writeFileSync(
    argumentFile,
    [...args, ...files].map((token) => textOf(argumentFileToken(token))).join('\n'),
  );
  const result = callUntyped(
    plan['spawn'] ?? spawnSync,
    plan.javac,
    [...ENGLISH_OUTPUT, `@${argumentFile}`],
    { cwd: plan.basedir, encoding: 'utf8', maxBuffer: MAX_OUTPUT_BYTES, timeout: LINT_TIMEOUT_MS },
  );
  const error = fieldOf(result, 'error');
  if (error !== undefined) {
    throw error;
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
): Compiled & { staged: unknown } {
  const staged = path.join(work, 'sources');
  const classes = path.join(work, 'classes');
  mkdirSync(classes, { recursive: true });
  const listed = new Set(plan.sources);
  const stagedTree = stageSources({ root: plan.root, sources, staged });
  const files = [
    ...textsOf(fieldOf(stagedTree, 'files')),
    ...(modular ? generatedFiles(plan.generatedSources).filter((file) => !listed.has(file)) : []),
  ];
  function compile(lookup: boolean | 'all'): Compiled {
    const args = textsOf(lintArguments(plan, { classes, modular: lookup }));
    return compileForLint({ plan, work, args, files });
  }
  const first = compile(modular);
  const compiled = first.code === 0 || !modular ? first : compile('all');
  return { ...withUnreadWarnings(compiled), staged: fieldOf(stagedTree, 'root') };
}

function lintSources(plan: LintPlan, request: LintSources): Compiled {
  const work = plan.workDirectory;
  rmSync(work, { recursive: true, force: true });
  try {
    const result = compiledSources(plan, request, work);
    const context = {
      staged: result.staged,
      from: path.relative(plan.root, plan.basedir),
      to: posix(path.relative(plan.reportRoot, plan.basedir)),
    };
    const log =
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

function clearReports(plan: LintPlan, reportDir: string): void {
  const files = [
    path.join(reportDir, LINT_REPORT),
    path.join(reportDir, LINT_FAILURE),
    path.join(plan.cacheDirectory, LINT_CACHE),
    path.join(plan.cacheDirectory, LINT_FINGERPRINT),
  ];
  for (const file of files) {
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

export function runJavacLint(planValue: unknown, { reportDir, baselineRoot }: LintRun): void {
  const plan = lintPlanOf(planValue);
  clearReports(plan, reportDir);
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
  const reports = { plan, output: path.join(reportDir, LINT_REPORT), fingerprint };
  if (sources.length === 0) {
    writeReports(reports, kept);
    return;
  }
  const result = lintSources(plan, { sources, modular: moduleInfo !== undefined });
  if (result.code === 0) {
    writeReports(reports, kept + result.log);
  } else {
    writeFileSync(path.join(reportDir, LINT_FAILURE), result.log);
  }
}
