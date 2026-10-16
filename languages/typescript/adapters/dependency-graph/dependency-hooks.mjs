import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, rmSync } from 'node:fs';
import path from 'node:path';
import { DEPENDENCY_MANIFESTS, detectPackageManager } from './package-managers/detect.mjs';
import { installCommand } from './package-managers/commands.mjs';
import { memberDependencyDirectories } from './package-managers/members.mjs';

const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;
const DEPENDENCY_INSTALL_TIMEOUT_MS = 4 * 60 * 1000;

function runInstall(projectRoot, packageManager) {
  const { command, args, environment, installHint } = installCommand(packageManager);
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env: { ...process.env, ...environment },
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
    timeout: DEPENDENCY_INSTALL_TIMEOUT_MS,
  });
  if (result.error?.code === 'ENOENT') {
    throw new Error(
      `Failed to install merge-base dependencies: this project uses ${packageManager.name}, which is not installed. ${installHint}`,
    );
  }
  return result;
}

const nodeDependencyHook = {
  language: 'typescript',
  manifests: DEPENDENCY_MANIFESTS,
  directory: 'node_modules',
  install(projectRoot) {
    const dependencyPath = path.join(projectRoot, nodeDependencyHook.directory);
    if (existsSync(dependencyPath)) {
      throw new Error(`Refusing to replace existing dependencies at ${dependencyPath}`);
    }
    const packageManager = detectPackageManager(projectRoot);
    const result = runInstall(projectRoot, packageManager);
    if (result.error !== undefined || result.status !== 0) {
      rmSync(dependencyPath, { recursive: true, force: true });
      if (result.error !== undefined) {
        throw result.error;
      }
      const detail = result.stderr.trim() || result.stdout.trim() || 'no diagnostic output';
      throw new Error(
        `Failed to install merge-base dependencies with ${packageManager.name}: ${detail}`,
      );
    }
    const entry = lstatSync(dependencyPath);
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      rmSync(dependencyPath, { recursive: true, force: true });
      throw new Error('Installed merge-base dependencies are not a regular directory');
    }
    const memberPaths = memberDependencyDirectories(projectRoot).map((relative) =>
      path.join(projectRoot, relative),
    );
    return { kind: 'installed', dependencyPath, memberPaths };
  },
};

const HOOKS = new Map([[nodeDependencyHook.language, nodeDependencyHook]]);

export function resolveDependencyHook(language = 'typescript') {
  const hook = HOOKS.get(language);
  if (hook === undefined) {
    throw new Error(`No dependency preparation hook for language: ${language}`);
  }
  return hook;
}
