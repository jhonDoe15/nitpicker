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

function inside(directory, file) {
  const relative = path.relative(directory, file);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

function generatedFiles(directories) {
  return directories
    .filter((directory) => existsSync(directory))
    .flatMap((directory) =>
      readdirSync(directory, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.java'))
        .map((entry) => path.join(entry.parentPath, entry.name)),
    )
    .sort();
}

function compileForLint({ plan, work, args, files }) {
  const argumentFile = path.join(work, 'javac.args');
  writeFileSync(
    argumentFile,
    [...args, ...files].map((token) => argumentFileToken(token)).join('\n'),
  );
  const spawn = plan.spawn ?? spawnSync;
  const result = spawn(plan.javac, [...ENGLISH_OUTPUT, `@${argumentFile}`], {
    cwd: plan.basedir,
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
    timeout: LINT_TIMEOUT_MS,
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  return { code: result.status, log: `${result.stdout}${result.stderr}` };
}

function lintSources(plan, { sources, modular }) {
  const work = plan.workDirectory;
  rmSync(work, { recursive: true, force: true });
  try {
    const staged = path.join(work, 'sources');
    const classes = path.join(work, 'classes');
    mkdirSync(classes, { recursive: true });
    const listed = new Set(plan.sources);
    const stagedTree = stageSources({ root: plan.root, sources, staged });
    const files = [
      ...stagedTree.files,
      ...(modular ? generatedFiles(plan.generatedSources).filter((file) => !listed.has(file)) : []),
    ];
    function compile(lookup) {
      return compileForLint({
        plan,
        work,
        args: lintArguments(plan, { classes, modular: lookup }),
        files,
      });
    }
    const first = compile(modular);
    const compiled = first.code === 0 || !modular ? first : compile('all');
    const result =
      compiled.code === 0 && hasUnreadWarnings(compiled.log)
        ? { code: 1, log: `${UNREAD_WARNINGS}\n${compiled.log}` }
        : compiled;
    const context = {
      staged: stagedTree.root,
      from: path.relative(plan.root, plan.basedir),
      to: posix(path.relative(plan.reportRoot, plan.basedir)),
    };
    return {
      code: result.code,
      log: result.code === 0 ? lintedWarnings(result.log, context) : relocated(result.log, context),
    };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function writeReports({ plan, output, fingerprint }, text) {
  writeFileSync(output, text);
  mkdirSync(plan.cacheDirectory, { recursive: true });
  writeFileSync(path.join(plan.cacheDirectory, LINT_CACHE), text);
  writeFileSync(path.join(plan.cacheDirectory, LINT_FINGERPRINT), fingerprint);
}

function clearReports(plan, files) {
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

function lintedSources(plan) {
  const java = [...new Set(plan.sources)]
    .filter((file) => file.endsWith('.java') && inside(plan.root, file) && existsSync(file))
    .sort();
  const moduleInfo = java.find((file) => path.basename(file) === MODULE_INFO);
  return {
    moduleInfo,
    all: java.filter((file) => file !== moduleInfo && inside(plan.basedir, file)),
  };
}

function reusedWarnings(plan, { baselineRoot, all, fingerprint }) {
  function reportPath(file) {
    return posix(path.relative(plan.reportRoot, file));
  }
  return reusableWarnings(plan, { baselineRoot, sources: all, fingerprint, reportPath });
}

function lintSourceSet(plan, { baselineRoot, files }) {
  clearReports(plan, files);
  const { moduleInfo, all } = lintedSources(plan);
  const fingerprint = lintFingerprint(plan);
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

function testPlan({ test, ...plan }) {
  return {
    ...plan,
    ...test,
    workDirectory: `${plan.workDirectory}-${TEST_LINT}`,
    cacheDirectory: path.join(plan.cacheDirectory, TEST_LINT),
  };
}

export function runJavacLint(plan, { reportDir, baselineRoot }) {
  const main = {
    report: path.join(reportDir, MAIN_REPORT),
    failure: path.join(reportDir, MAIN_FAILURE),
  };
  const test = {
    report: path.join(reportDir, TEST_REPORT),
    failure: path.join(reportDir, TEST_FAILURE),
  };
  lintSourceSet(plan, { baselineRoot, files: main });
  const tests = testPlan(plan);
  if (plan.test === undefined) {
    clearReports(tests, test);
    return;
  }
  lintSourceSet(tests, { baselineRoot, files: test });
}
