import { type SpawnSyncReturns, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { containedPath } from '../../core/fix/common/contained-path.mjs';
import { type Fields, fieldsOf } from '../json/fields.mts';
import {
  CONSUMER_SOURCE,
  CONSUMER_TEST,
  EXCLUDED_FROM_SELF_FIXTURE,
  convertToTypeScript,
  generatedModule,
  generatedTest,
} from './fixture-sources.mts';

export const FIXTURE_KINDS = ['self', 'consumer', 'generated'] as const;

export type FixtureKind = (typeof FIXTURE_KINDS)[number];

const packageRoot = path.resolve(import.meta.dirname, '../..');
const GENERATED_MODULES = 40;
const COMMAND_TIMEOUT_MS = 900_000;
const DEVELOPMENT_PACKAGES = ['vitest', '@vitest/coverage-v8', 'typescript', '@types/node'];

type Command = (
  cwd: string,
  executable: string,
  args: readonly string[],
) => SpawnSyncReturns<string>;

export type Shell = {
  readonly run: Command;
  readonly checked: (cwd: string, executable: string, args: readonly string[]) => string;
};

export function shellWith(environment: NodeJS.ProcessEnv): Shell {
  function run(cwd: string, executable: string, args: readonly string[]): SpawnSyncReturns<string> {
    const result = spawnSync(executable, args, {
      cwd,
      encoding: 'utf8',
      env: { ...environment, NO_COLOR: '1' },
      timeout: COMMAND_TIMEOUT_MS,
    });
    if (result.error) {
      throw result.error;
    }
    return result;
  }
  function checked(cwd: string, executable: string, args: readonly string[]): string {
    const result = run(cwd, executable, args);
    if (result.status !== 0) {
      throw new Error(`${executable} ${args.join(' ')} failed\n${result.stdout}${result.stderr}`);
    }
    return result.stdout.trim();
  }
  return { run, checked };
}

function write(root: string, relative: string, contents: string): void {
  const target = containedPath(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

function readManifest(): Fields {
  const parsed: unknown = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  return fieldsOf(parsed) ?? {};
}

function fixtureManifest(kind: FixtureKind, tarball: string, manifest: Fields): string {
  const development = fieldsOf(manifest['devDependencies']) ?? {};
  const devDependencies = {
    nitpicker: `file:${tarball}`,
    ...Object.fromEntries(DEVELOPMENT_PACKAGES.map((name) => [name, development[name]])),
  };
  const fixture = {
    name: `nitpicker-weights-${kind}`,
    private: true,
    type: 'module',
    devDependencies,
  };
  return `${JSON.stringify(fixture, null, 2)}\n`;
}

function writeConsumer(root: string): string[] {
  write(root, 'src/main/example.ts', CONSUMER_SOURCE);
  write(root, 'test/example.test.ts', CONSUMER_TEST);
  return ['src/main/example.ts'];
}

function writeGenerated(root: string): string[] {
  for (const index of Array.from({ length: GENERATED_MODULES }, (_, module) => module)) {
    write(root, `src/main/feature${String(index)}/rules.ts`, generatedModule(index));
    write(root, `src/main/feature${String(index)}/rules.test.ts`, generatedTest(index));
  }
  return ['src/main/feature0/rules.ts', 'src/main/feature1/rules.ts'];
}

function writeSelf(root: string): string[] {
  for (const directory of ['core', 'shared', 'languages']) {
    cpSync(path.join(packageRoot, directory), path.join(root, 'src/main/nitpicker', directory), {
      recursive: true,
      filter: (source) => !EXCLUDED_FROM_SELF_FIXTURE.test(source),
    });
  }
  convertToTypeScript(path.join(root, 'src/main/nitpicker'));
  return [
    'src/main/nitpicker/core/diff/sharding.ts',
    'src/main/nitpicker/languages/typescript/preset/layout.ts',
    'src/main/nitpicker/core/tooling/policy-links.ts',
  ];
}

function writeSources(kind: FixtureKind, root: string): string[] {
  if (kind === 'consumer') {
    return writeConsumer(root);
  }
  return kind === 'generated' ? writeGenerated(root) : writeSelf(root);
}

function packTarball(shell: Shell, manifest: Fields): { root: string; tarball: string } {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-weights-pack-'));
  shell.checked(packageRoot, 'npm', ['pack', '--pack-destination', root]);
  return { root, tarball: path.join(root, `nitpicker-${String(manifest['version'])}.tgz`) };
}

function commitBaseline(shell: Shell, root: string): void {
  shell.checked(root, 'npx', ['--yes', 'npm@11', 'install', '--no-audit', '--no-fund']);
  shell.checked(root, 'git', ['add', '.']);
  const identity = ['-c', 'user.name=Weights', '-c', 'user.email=weights@example.invalid'];
  shell.checked(root, 'git', [...identity, 'commit', '-m', 'baseline']);
  shell.checked(root, 'git', ['switch', '-c', 'feature']);
}

function editMeasuredFiles(root: string, edited: readonly string[]): void {
  for (const [index, file] of edited.entries()) {
    const current = readFileSync(containedPath(root, file), 'utf8');
    write(
      root,
      file,
      `${current}\nexport const measuredChange${String(index)} = ${String(index)};\n`,
    );
  }
}

export function buildFixture(kind: FixtureKind, root: string, shell: Shell): void {
  const manifest = readManifest();
  mkdirSync(root, { recursive: true });
  const pack = packTarball(shell, manifest);
  shell.checked(root, 'git', ['init', '-b', 'main']);
  write(root, '.gitignore', 'node_modules/\nreports/\n');
  write(root, 'package.json', fixtureManifest(kind, pack.tarball, manifest));
  const edited = writeSources(kind, root);
  commitBaseline(shell, root);
  editMeasuredFiles(root, edited);
  rmSync(pack.root, { recursive: true, force: true });
}
