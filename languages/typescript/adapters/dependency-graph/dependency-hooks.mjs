import { existsSync, lstatSync, rmSync } from 'node:fs';
import {
  DEPENDENCY_MANIFESTS,
  detectPackageManager,
  managerRoot,
} from './package-managers/detect.mjs';
import { containedPath } from './package-managers/contained-path.mjs';
import {
  ensureDependencyFolder,
  failureMessage,
  installDependencies,
} from './package-managers/install.mjs';
import { memberDependencyDirectories } from './package-managers/members.mjs';
import { prepareLocalPackages, removeLocalPackages } from './local-packages.mjs';

const DEPENDENCY_DIRECTORY = 'node_modules';

function absoluteMembers(root, relatives) {
  return relatives.map((relative) => containedPath(root, relative));
}

function removeInstalled(dependencyPath, memberPaths) {
  for (const memberPath of memberPaths) {
    rmSync(memberPath, { recursive: true, force: true });
  }
  rmSync(dependencyPath, { recursive: true, force: true });
}

function assertRegularDirectory(dependencyPath) {
  const entry = lstatSync(dependencyPath);
  if (!entry.isDirectory() || entry.isSymbolicLink()) {
    throw new Error('Installed merge-base dependencies are not a regular directory');
  }
}

function installedMembers(root, existingMembers) {
  return absoluteMembers(
    root,
    memberDependencyDirectories(root).filter((relative) => !existingMembers.has(relative)),
  );
}

function installInto(packageManager, dependencyPath, missingLocalPackages) {
  const outcome = installDependencies(packageManager);
  if (!outcome.ok) {
    throw new Error(failureMessage(packageManager, outcome.detail, missingLocalPackages));
  }
  ensureDependencyFolder(packageManager, dependencyPath);
  assertRegularDirectory(dependencyPath);
}

const nodeDependencyHook = {
  language: 'typescript',
  manifests: DEPENDENCY_MANIFESTS,
  directory: DEPENDENCY_DIRECTORY,
  dependencyRoot: managerRoot,
  install(projectRoot, liveProjectRoot) {
    const packageManager = detectPackageManager(projectRoot);
    const dependencyPath = containedPath(packageManager.root, DEPENDENCY_DIRECTORY);
    if (existsSync(dependencyPath)) {
      throw new Error(`Refusing to replace existing dependencies at ${dependencyPath}`);
    }
    const existingMembers = new Set(memberDependencyDirectories(packageManager.root));
    function memberPaths() {
      return installedMembers(packageManager.root, existingMembers);
    }
    const localPackages = prepareLocalPackages(packageManager.root, liveProjectRoot);
    try {
      installInto(packageManager, dependencyPath, localPackages.missing);
    } catch (error) {
      removeInstalled(dependencyPath, memberPaths());
      removeLocalPackages(localPackages.copied);
      throw error;
    }
    return {
      kind: 'installed',
      dependencyPath,
      memberPaths: memberPaths(),
      localPackagePaths: localPackages.copied,
    };
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
