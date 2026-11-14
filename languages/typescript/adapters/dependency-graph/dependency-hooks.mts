import { existsSync, lstatSync, rmSync } from 'node:fs';
import {
  DEPENDENCY_MANIFESTS,
  detectPackageManager,
  managerRoot,
} from './package-managers/detect.mts';
import type { ManagerAtRoot } from './package-managers/commands.mts';
import { containedPath } from './package-managers/contained-path.mts';
import {
  ensureDependencyFolder,
  failureMessage,
  installDependencies,
} from './package-managers/install.mts';
import { memberDependencyDirectories } from './package-managers/members.mts';
import { prepareLocalPackages, removeLocalPackages } from './local-packages.mts';

const DEPENDENCY_DIRECTORY = 'node_modules';

type DependencyHook = {
  language: string;
  manifests: string[];
  directory: string;
  dependencyRoot: (projectRoot: string) => string;
  install: (
    projectRoot: string,
    liveProjectRoot?: string,
  ) => {
    kind: string;
    dependencyPath: string;
    memberPaths: string[];
    localPackagePaths: string[];
  };
};

function absoluteMembers(root: string, relatives: string[]): string[] {
  return relatives.map((relative: string) => containedPath(root, relative));
}

function removeInstalled(dependencyPath: string, memberPaths: string[]): void {
  for (const memberPath of memberPaths) {
    rmSync(memberPath, { recursive: true, force: true });
  }
  rmSync(dependencyPath, { recursive: true, force: true });
}

function assertRegularDirectory(dependencyPath: string): void {
  const entry = lstatSync(dependencyPath);
  if (!entry.isDirectory() || entry.isSymbolicLink()) {
    throw new Error('Installed merge-base dependencies are not a regular directory');
  }
}

function installedMembers(root: string, existingMembers: Set<string>): string[] {
  return absoluteMembers(
    root,
    memberDependencyDirectories(root).filter((relative: string) => !existingMembers.has(relative)),
  );
}

function installInto(
  packageManager: ManagerAtRoot,
  dependencyPath: string,
  missingLocalPackages: string[],
): void {
  const outcome = installDependencies(packageManager);
  if (!outcome.ok) {
    throw new Error(failureMessage(packageManager, outcome.detail, { missingLocalPackages }));
  }
  ensureDependencyFolder(packageManager, dependencyPath);
  assertRegularDirectory(dependencyPath);
}

const nodeDependencyHook: DependencyHook = {
  language: 'typescript',
  manifests: DEPENDENCY_MANIFESTS,
  directory: DEPENDENCY_DIRECTORY,
  dependencyRoot: managerRoot,
  install(projectRoot: string, liveProjectRoot?: string) {
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

export function resolveDependencyHook(language = 'typescript'): DependencyHook {
  const hook = HOOKS.get(language);
  if (hook === undefined) {
    throw new Error(`No dependency preparation hook for language: ${language}`);
  }
  return hook;
}
