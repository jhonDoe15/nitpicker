import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// npm 10.9 crashes resolving vitest's optional peers ("reading 'edgesOut'"), so the consumer
// install is pinned to a newer npm.
export const INSTALLER = 'npm@11';

const GIT_IDENTITY = ['-c', 'user.name=Nitpicker Eval', '-c', 'user.email=eval@example.invalid'];

export function command(cwd, executable, args, { env = {}, timeout = 180_000, input } = {}) {
  const result = spawnSync(executable, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1', ...env },
    timeout,
    input,
  });
  // EPIPE means the process exited without reading all of its input (an agent that ignores its
  // prompt). That is the process's own outcome, recorded through its status, not a harness failure.
  if (result.error && !['ETIMEDOUT', 'EPIPE'].includes(result.error.code)) throw result.error;
  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
    timedOut: result.error?.code === 'ETIMEDOUT',
  };
}

export function checked(cwd, executable, args) {
  const result = command(cwd, executable, args);
  if (result.status !== 0) {
    throw new Error(`${executable} ${args.join(' ')} exited ${result.status}\n${result.output}`);
  }
  return result.output.trim();
}

export function write(root, relative, contents) {
  const target = path.join(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

/** Packs the nitpicker package at `packageRoot` into a temporary directory. */
export function packNitpicker(packageRoot) {
  const packRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-packed-'));
  checked(packageRoot, 'npm', ['pack', '--pack-destination', packRoot]);
  const tarballs = readdirSync(packRoot).filter((file) => file.endsWith('.tgz'));
  if (tarballs.length !== 1) throw new Error(`expected one tarball in ${packRoot}`);
  return {
    tarball: path.join(packRoot, tarballs[0]),
    cleanup: () => rmSync(packRoot, { recursive: true, force: true }),
  };
}

/**
 * Creates a git consumer project in `root` that has the packed tarball installed, and commits it on
 * `main`. `files` (path to text) are written before the install and committed with it.
 * `packageJson` adds fields to the consumer manifest; its devDependencies are merged with the
 * tarball and the peers taken from `manifest` (the nitpicker package.json).
 */
export function createConsumer({
  root,
  tarball,
  manifest,
  files = {},
  packageJson = {},
  strategy,
  commitMessage = 'clean baseline',
}) {
  checked(root, 'git', ['init', '-b', 'main']);
  write(root, '.gitignore', 'node_modules/\nreports/\n');
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
          vitest: manifest.devDependencies.vitest,
          '@vitest/coverage-v8': manifest.devDependencies['@vitest/coverage-v8'],
          typescript: manifest.devDependencies.typescript,
          '@types/node': manifest.devDependencies['@types/node'],
          ...packageJson.devDependencies,
        },
      },
      null,
      2,
    ) + '\n',
  );
  for (const [relative, contents] of Object.entries(files)) write(root, relative, contents);
  // The lockfile is committed so the merge-base worktree can `npm ci`.
  checked(root, 'npx', [
    '--yes',
    INSTALLER,
    'install',
    '--no-audit',
    '--no-fund',
    '--prefer-offline',
    ...(strategy ? [`--install-strategy=${strategy}`] : []),
  ]);
  checked(root, 'git', ['add', '.']);
  checked(root, 'git', [...GIT_IDENTITY, 'commit', '-m', commitMessage]);
}
