import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fieldAt } from '../../scripts/json/fields.mts';
import { DEFAULT_PRESET, gitignoreOf, peerDependencies, type Preset } from './presets.mts';

export const NPM_VERSION_THAT_RESOLVES_VITEST_OPTIONAL_PEERS = 'npm@11';

const MAX_OUTPUT_BYTES = 256 * 1024 * 1024;
const GIT_IDENTITY = ['-c', 'user.name=Nitpicker Eval', '-c', 'user.email=eval@example.invalid'];
const OUTCOMES_RECORDED_THROUGH_STATUS = ['ETIMEDOUT', 'EPIPE'];

export type Dependencies = Readonly<Record<string, string>>;

export type CommandOptions = {
  readonly env?: Readonly<Record<string, string>>;
  readonly timeout?: number;
  readonly input?: string | undefined;
};

export type CommandResult = {
  readonly status: number | null;
  readonly output: string;
  readonly timedOut: boolean;
};

type ConsumerOptions = {
  readonly root: string;
  readonly tarball: string;
  readonly manifest: unknown;
  readonly files?: Readonly<Record<string, string>>;
  readonly packageJson?: {
    readonly dependencies?: Dependencies | undefined;
    readonly devDependencies?: Dependencies;
  };
  readonly preset?: Preset;
  readonly strategy?: string;
  readonly commitMessage?: string;
};

export function command(
  cwd: string,
  executable: string,
  args: readonly string[],
  { env = {}, timeout = 180_000, input }: CommandOptions = {},
): CommandResult {
  const result = spawnSync(executable, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1', ...env },
    timeout,
    input,
    maxBuffer: MAX_OUTPUT_BYTES,
  });
  const code = fieldAt(result.error, 'code');
  const recordedThroughStatus =
    typeof code === 'string' && OUTCOMES_RECORDED_THROUGH_STATUS.includes(code);
  if (result.error && !recordedThroughStatus) throw result.error;
  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
    timedOut: code === 'ETIMEDOUT',
  };
}

export function checked(
  cwd: string,
  executable: string,
  args: readonly string[],
  options?: CommandOptions,
): string {
  const result = command(cwd, executable, args, options);
  if (result.status !== 0) {
    throw new Error(
      `${executable} ${args.join(' ')} exited ${String(result.status)}\n${result.output}`,
    );
  }
  return result.output.trim();
}

export function write(root: string, relative: string, contents: string): void {
  const target = path.join(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

export function packNitpicker(packageRoot: string): {
  readonly tarball: string;
  readonly cleanup: () => void;
} {
  const packRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-packed-'));
  checked(packageRoot, 'npm', ['pack', '--pack-destination', packRoot]);
  const tarballs = readdirSync(packRoot).filter((file) => file.endsWith('.tgz'));
  const [tarball] = tarballs;
  if (tarballs.length !== 1 || tarball === undefined) {
    throw new Error(`expected one tarball in ${packRoot}`);
  }
  return {
    tarball: path.join(packRoot, tarball),
    cleanup: () => rmSync(packRoot, { recursive: true, force: true }),
  };
}

function installWithLockfileCommittedForMergeBaseWorktree(
  root: string,
  strategy: string | undefined,
): void {
  checked(root, 'npx', [
    '--yes',
    NPM_VERSION_THAT_RESOLVES_VITEST_OPTIONAL_PEERS,
    'install',
    '--no-audit',
    '--no-fund',
    ...(strategy ? [`--install-strategy=${strategy}`] : []),
  ]);
}

export function createConsumer({
  root,
  tarball,
  manifest,
  files = {},
  packageJson = {},
  preset = DEFAULT_PRESET,
  strategy,
  commitMessage = 'clean baseline',
}: ConsumerOptions): void {
  checked(root, 'git', ['init', '-b', 'main']);
  write(root, '.gitignore', gitignoreOf(preset, files['.gitignore']));
  write(
    root,
    'package.json',
    JSON.stringify(
      {
        name: 'nitpicker-installed-consumer',
        private: true,
        type: 'module',
        ...packageJson,
        devDependencies: {
          nitpicker: `file:${tarball}`,
          ...peerDependencies(preset, manifest),
          ...packageJson.devDependencies,
        },
      },
      null,
      2,
    ) + '\n',
  );
  for (const [relative, contents] of Object.entries(files)) {
    if (relative !== '.gitignore') write(root, relative, contents);
  }
  installWithLockfileCommittedForMergeBaseWorktree(root, strategy);
  checked(root, 'git', ['add', '.']);
  checked(root, 'git', [...GIT_IDENTITY, 'commit', '-m', commitMessage]);
}
