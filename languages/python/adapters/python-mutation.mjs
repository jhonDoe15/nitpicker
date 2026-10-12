import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  collectRunData,
  MUTANTS_DIRECTORY,
  MUTATION_REPORT,
  NO_COVERAGE_EXIT_CODE,
} from './python-mutation-data.mjs';
import { seedMutantsFromBase } from './python-mutation-reuse.mjs';

export const MUTATION_FAILED_RULE = 'mutation-failed';
const MUTATION_TIMEOUT_MS = 60 * 60 * 1000;
const NOTHING_COVERED = 'could not find any test case for any mutant';
const PYPROJECT = 'pyproject.toml';
const PYPROJECT_SECTION = /^\s*\[tool\.mutmut\]/mu;
const SETUP_CFG_SECTION = /^\s*\[mutmut\]/mu;
const TEST_PATTERNS = [
  'tests/*',
  'test/*',
  '*/tests/*',
  '*/test/*',
  'test_*.py',
  '*/test_*.py',
  '*_test.py',
  'conftest.py',
  '*/conftest.py',
];

function failure(message) {
  return Object.assign(new Error(message), { rule: MUTATION_FAILED_RULE });
}

function readOptional(file) {
  return existsSync(file) ? readFileSync(file, 'utf8') : '';
}

function hasProjectConfiguration(projectRoot) {
  return (
    PYPROJECT_SECTION.test(readOptional(path.join(projectRoot, PYPROJECT))) ||
    SETUP_CFG_SECTION.test(readOptional(path.join(projectRoot, 'setup.cfg')))
  );
}

export function ensureMutmutConfiguration({ projectRoot, project }) {
  if (hasProjectConfiguration(projectRoot)) {
    return;
  }
  if (project.sourceRoots.includes('.')) {
    throw failure(
      'mutmut needs the directories to mutate: set "python.sourceRoots" in nitpicker.config.json or source_paths in [tool.mutmut]',
    );
  }
  const pyproject = path.join(projectRoot, PYPROJECT);
  const section = [
    '[tool.mutmut]',
    `source_paths = ${JSON.stringify(project.sourceRoots)}`,
    `do_not_mutate = ${JSON.stringify(TEST_PATTERNS)}`,
  ].join('\n');
  writeFileSync(pyproject, `${readOptional(pyproject)}\n${section}\n`);
}

function finishedRun({ status, stdout, stderr }) {
  return status === 0 || (status === 1 && `${stdout}${stderr}`.includes(NOTHING_COVERED));
}

export function runMutation(context, run, platform = process.platform) {
  if (platform === 'win32') {
    throw failure('mutmut needs POSIX fork and does not run on Windows: run nitpicker inside WSL');
  }
  const { projectRoot, reportRoot } = context;
  const mutants = path.join(projectRoot, MUTANTS_DIRECTORY);
  rmSync(mutants, { recursive: true, force: true });
  ensureMutmutConfiguration(context);
  seedMutantsFromBase({ ...context, sourceRoots: context.project.sourceRoots });
  const result = run(context, ['mutmut', 'run'], {
    accepted: finishedRun,
    rule: MUTATION_FAILED_RULE,
    timeoutMs: MUTATION_TIMEOUT_MS,
  });
  const data = collectRunData({
    projectRoot,
    uncheckedExitCode: result.status === 0 ? undefined : NO_COVERAGE_EXIT_CODE,
  });
  writeFileSync(path.join(reportRoot, MUTATION_REPORT), JSON.stringify(data));
  if (context.snapshot !== 'base') {
    rmSync(mutants, { recursive: true, force: true });
  }
}
