import { existsSync, readFileSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { loadTree } from '../detectors/tree.mjs';
import { checked, command, createConsumer, write } from './consumer.mjs';
import { gitignoreOf, usesNpmPackages } from './presets.mjs';

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT_MANIFESTS = {
  typescript: ['languages', 'typescript', 'preset', 'fixtures', 'strict-clean', 'package.json'],
  javascript: ['languages', 'javascript', 'preset', 'fixtures', 'js-clean', 'package.json'],
};
const PYTHON_TOOLS = ['coverage', 'mutmut', 'pytest', 'mypy'];
const PYTHON_VERSION = '3.13';
export const PYTHON_CONSTRAINTS = path.join(PACKAGE_ROOT, '.github', 'python-e2e-constraints.txt');
const PROVISION_TIMEOUT_MS = 600_000;
const PLAIN_MANIFEST = `${JSON.stringify({ name: 'nitpicker-eval-consumer', private: true, type: 'module' }, null, 2)}\n`;
// A fixed date makes the fixture commit identical for every run of a case, so the gate's findings
// cache (keyed by the merge-base commit) reuses the base-side analysis instead of redoing it.
const FIXTURE_COMMIT_DATE = '2026-01-01T00:00:00Z';

/**
 * The fixture's files as the consumer has them. A fixture that has no `nitpicker.config.json`
 * gets one that only names its preset, unless the preset is the default one.
 */
function fixtureFiles(caseDefinition) {
  const files = loadTree(caseDefinition.fixtureDirectory);
  if (!files.has('nitpicker.config.json') && caseDefinition.preset !== 'typescript') {
    files.set('nitpicker.config.json', `${JSON.stringify({ preset: caseDefinition.preset })}\n`);
  }
  return files;
}

export function pipArguments({ caseDefinition, pyproject }) {
  const text = existsSync(pyproject) ? readFileSync(pyproject, 'utf8') : '';
  const editable = /^\[build-system\]/mu.test(text) ? ['-e', '.'] : [];
  const group =
    text.includes('[dependency-groups]') && /^\s*dev\s*=/mu.test(text) ? ['--group', 'dev'] : [];
  const extras = Object.entries(caseDefinition.dependencies ?? {}).map(
    ([name, spec]) => `${name}${spec}`,
  );
  return [
    'pip',
    'install',
    '-q',
    '--python',
    '.venv',
    '--constraint',
    PYTHON_CONSTRAINTS,
    ...editable,
    ...group,
    ...PYTHON_TOOLS,
    ...extras,
  ];
}

/**
 * Gives a Python project the environment its gate runs in: a uv-created `.venv` on Python 3.13 holding the
 * project (editable), pytest, coverage, mutmut and mypy, the project's `dev` dependency group when
 * it declares one, and the packages `case.json` lists under `dependencies` (name to version spec).
 * The tools are held to the versions in `.github/python-e2e-constraints.txt`, as the Python e2e
 * suites hold theirs.
 * Gradle and Maven projects need nothing: the gate uses `gradle` or `mvn` from the PATH.
 */
export function provisionEnvironment({ caseDefinition, workdir }) {
  if (caseDefinition.preset !== 'python') return;
  const options = { timeout: PROVISION_TIMEOUT_MS };
  checked(workdir, 'uv', ['venv', '-q', '--python', PYTHON_VERSION, '.venv'], options);
  const pyproject = path.join(workdir, 'pyproject.toml');
  checked(workdir, 'uv', pipArguments({ caseDefinition, pyproject }), options);
}

function commitFixture(workdir) {
  const result = command(
    workdir,
    'git',
    ['-c', 'user.name=Eval', '-c', 'user.email=eval@example.invalid', 'commit', '-m', 'fixture'],
    { env: { GIT_AUTHOR_DATE: FIXTURE_COMMIT_DATE, GIT_COMMITTER_DATE: FIXTURE_COMMIT_DATE } },
  );
  if (result.status !== 0) {
    throw new Error(`git commit exited ${result.status}\n${result.output}`);
  }
}

/** Default workdir setup: the fixture installed as a consumer of the packed tarball. */
export function installedWorkdir({ tarball, manifest }) {
  return ({ caseDefinition, workdir }) => {
    createConsumer({
      root: workdir,
      tarball,
      manifest,
      files: Object.fromEntries(fixtureFiles(caseDefinition)),
      preset: caseDefinition.preset,
      packageJson: usesNpmPackages(caseDefinition.preset)
        ? { dependencies: caseDefinition.dependencies }
        : {},
    });
    provisionEnvironment({ caseDefinition, workdir });
    checked(workdir, 'git', ['switch', '-c', 'feature']);
  };
}

/** Workdir setup without an install, for tests of the runner itself. */
export function copiedWorkdir() {
  return ({ caseDefinition, workdir }) => {
    checked(workdir, 'git', ['init', '-b', 'main']);
    for (const [relative, contents] of fixtureFiles(caseDefinition)) {
      if (relative !== '.gitignore' || !existsSync(path.join(workdir, relative))) {
        write(workdir, relative, contents);
      }
    }
    checked(workdir, 'git', ['add', '.']);
    commitFixture(workdir);
    checked(workdir, 'git', ['switch', '-c', 'feature']);
  };
}

function scriptManifest(caseDefinition) {
  const file = path.join(PACKAGE_ROOT, ...SCRIPT_MANIFESTS[caseDefinition.preset]);
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  manifest.dependencies = { ...manifest.dependencies, ...caseDefinition.dependencies };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

const harnessManifest = (caseDefinition) =>
  usesNpmPackages(caseDefinition.preset) ? scriptManifest(caseDefinition) : PLAIN_MANIFEST;

/**
 * The files of the workdir `linkedWorkdir` builds, as a map of path to text: the fixture, the
 * `.gitignore` of the preset (then the fixture's entries), a `package.json` for the gate's
 * tooling unless the fixture has one, and the injected `nitpicker.config.json`.
 */
export function linkedTree(caseDefinition) {
  const files = fixtureFiles(caseDefinition);
  files.set('.gitignore', gitignoreOf(caseDefinition.preset, files.get('.gitignore')));
  if (!files.has('package.json')) files.set('package.json', harnessManifest(caseDefinition));
  return files;
}

/**
 * The fixture set up as an installed consumer would have it, except that the script dependencies
 * are the ones already in the repository's `node_modules` (linked, no install, no network) and a
 * Python project gets its `.venv`. The real gate then runs against it.
 */
export function linkedWorkdir() {
  const prepare = copiedWorkdir();
  return ({ caseDefinition, workdir }) => {
    const { preset } = caseDefinition;
    const fixture = loadTree(caseDefinition.fixtureDirectory);
    write(workdir, '.gitignore', gitignoreOf(preset, fixture.get('.gitignore')));
    write(workdir, 'package.json', harnessManifest(caseDefinition));
    if (usesNpmPackages(preset)) {
      symlinkSync(path.join(PACKAGE_ROOT, 'node_modules'), path.join(workdir, 'node_modules'));
    }
    prepare({ caseDefinition, workdir });
    provisionEnvironment({ caseDefinition, workdir });
  };
}
