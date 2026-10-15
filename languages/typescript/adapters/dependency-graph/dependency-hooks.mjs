import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, rmSync } from 'node:fs';
import path from 'node:path';

const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;
const DEPENDENCY_INSTALL_TIMEOUT_MS = 4 * 60 * 1000;

const npmDependencyHook = {
  language: 'typescript',
  manifests: ['package.json', 'package-lock.json'],
  directory: 'node_modules',
  install(projectRoot) {
    const dependencyPath = path.join(projectRoot, npmDependencyHook.directory);
    if (existsSync(dependencyPath)) {
      throw new Error(`Refusing to replace existing dependencies at ${dependencyPath}`);
    }
    const result = spawnSync(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-offline'],
      {
        cwd: projectRoot,
        encoding: 'utf8',
        maxBuffer: MAX_OUTPUT_BYTES,
        timeout: DEPENDENCY_INSTALL_TIMEOUT_MS,
      },
    );
    if (result.error !== undefined || result.status !== 0) {
      rmSync(dependencyPath, { recursive: true, force: true });
      if (result.error !== undefined) {
        throw result.error;
      }
      const detail = result.stderr.trim() || result.stdout.trim() || 'no diagnostic output';
      throw new Error(`Failed to install merge-base dependencies: ${detail}`);
    }
    const entry = lstatSync(dependencyPath);
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      rmSync(dependencyPath, { recursive: true, force: true });
      throw new Error('Installed merge-base dependencies are not a regular directory');
    }
    return { kind: 'installed', dependencyPath };
  },
};

const HOOKS = new Map([[npmDependencyHook.language, npmDependencyHook]]);

export function resolveDependencyHook(language = 'typescript') {
  const hook = HOOKS.get(language);
  if (hook === undefined) {
    throw new Error(`No dependency preparation hook for language: ${language}`);
  }
  return hook;
}
