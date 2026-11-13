import { existsSync, readFileSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { loadTree } from '../detectors/tree.mts';
import { checked, command, createConsumer, write } from './consumer.mts';
import { type Preset, gitignoreOf, usesNpmPackages } from './presets.mts';
import { type PrepareWorkdir } from '../runner/run-case.mts';
import { type CaseDefinition } from '../case-definition/case-definition.mts';
import { fieldsOf, requiredFields } from '../../scripts/json/fields.mts';

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT_MANIFESTS: Partial<Record<Preset, readonly string[]>> = {
  typescript: ['languages', 'typescript', 'preset', 'fixtures', 'strict-clean', 'package.json'],
  javascript: ['languages', 'javascript', 'preset', 'fixtures', 'js-clean', 'package.json'],
};
const PYTHON_TOOLS = ['coverage', 'mutmut', 'pytest', 'mypy'];
const PYTHON_VERSION = '3.13';
export const PYTHON_CONSTRAINTS = path.join(PACKAGE_ROOT, '.github', 'python-e2e-constraints.txt');
const PROVISION_TIMEOUT_MS = 600_000;
const PLAIN_MANIFEST_FIELDS = { name: 'nitpicker-eval-consumer', private: true, type: 'module' };
const PLAIN_MANIFEST = `${JSON.stringify(PLAIN_MANIFEST_FIELDS, null, 2)}\n`;
const REPRODUCIBLE_FIXTURE_COMMIT_DATE = '2026-01-01T00:00:00Z';

function fixtureFiles(caseDefinition: CaseDefinition): Map<string, string> {
  const files: Map<string, string> = loadTree(caseDefinition.fixtureDirectory);
  if (!files.has('nitpicker.config.json') && caseDefinition.preset !== 'typescript') {
    files.set('nitpicker.config.json', `${JSON.stringify({ preset: caseDefinition.preset })}\n`);
  }
  return files;
}

export function pipArguments({
  caseDefinition,
  pyproject,
}: {
  readonly caseDefinition: Pick<CaseDefinition, 'dependencies'>;
  readonly pyproject: string;
}): string[] {
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

export function provisionEnvironment({
  caseDefinition,
  workdir,
}: {
  readonly caseDefinition: CaseDefinition;
  readonly workdir: string;
}): void {
  if (caseDefinition.preset !== 'python') return;
  const options = { timeout: PROVISION_TIMEOUT_MS };
  checked(workdir, 'uv', ['venv', '-q', '--python', PYTHON_VERSION, '.venv'], options);
  const pyproject = path.join(workdir, 'pyproject.toml');
  checked(workdir, 'uv', pipArguments({ caseDefinition, pyproject }), options);
}

function commitFixture(workdir: string): void {
  const result = command(
    workdir,
    'git',
    ['-c', 'user.name=Eval', '-c', 'user.email=eval@example.invalid', 'commit', '-m', 'fixture'],
    {
      env: {
        GIT_AUTHOR_DATE: REPRODUCIBLE_FIXTURE_COMMIT_DATE,
        GIT_COMMITTER_DATE: REPRODUCIBLE_FIXTURE_COMMIT_DATE,
      },
    },
  );
  if (result.status !== 0) {
    throw new Error(`git commit exited ${String(result.status)}\n${result.output}`);
  }
}

export function installedWorkdir({
  tarball,
  manifest,
}: {
  readonly tarball: string;
  readonly manifest: unknown;
}): PrepareWorkdir {
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

export function copiedWorkdir(): PrepareWorkdir {
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

function scriptManifest(caseDefinition: CaseDefinition): string {
  const segments = SCRIPT_MANIFESTS[caseDefinition.preset];
  if (segments === undefined) throw new Error(`${caseDefinition.preset} has no script manifest`);
  const manifest = requiredFields(
    JSON.parse(readFileSync(path.join(PACKAGE_ROOT, ...segments), 'utf8')),
    'script manifest',
  );
  const dependencies = { ...fieldsOf(manifest['dependencies']), ...caseDefinition.dependencies };
  return `${JSON.stringify({ ...manifest, dependencies }, null, 2)}\n`;
}

function harnessManifest(caseDefinition: CaseDefinition): string {
  return usesNpmPackages(caseDefinition.preset) ? scriptManifest(caseDefinition) : PLAIN_MANIFEST;
}

export function linkedTree(caseDefinition: CaseDefinition): Map<string, string> {
  const files = fixtureFiles(caseDefinition);
  files.set('.gitignore', gitignoreOf(caseDefinition.preset, files.get('.gitignore')));
  if (!files.has('package.json')) files.set('package.json', harnessManifest(caseDefinition));
  return files;
}

export function linkedWorkdir(): PrepareWorkdir {
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
