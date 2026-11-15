import { PACKAGE_ROOT } from '../../../../core/tooling/tool-resolution.mjs';
import { resolveDependencyHook } from '../dependency-graph/dependency-hooks.mts';
import { detectPackageManager } from '../dependency-graph/package-managers/detect.mts';
import { containedPath } from '../dependency-graph/package-managers/contained-path.mts';
import { missingDependenciesMessage } from '../dependency-graph/package-managers/install.mts';
import { linkMemberDependencies } from '../dependency-graph/package-managers/member-links.mts';
import { removeLocalPackages } from '../dependency-graph/local-packages.mts';
import {
  existsSync,
  readFileSync,
  lstatSync,
  realpathSync,
  symlinkSync,
  rmSync,
  unlinkSync,
} from 'node:fs';
import path from 'node:path';
import { fieldOf } from '../../../../shared/values/readers.mts';

type DependencyHook = ReturnType<typeof resolveDependencyHook>;

type PreparationRequest = {
  readonly projectRoot: string;
  readonly liveProjectRoot?: string | undefined;
  readonly toolRoot?: unknown;
  readonly dependencyHook?: DependencyHook | undefined;
};

type PreparedDependencies = {
  readonly kind: string;
  readonly dependencyPath: string;
  readonly dependencyRoot?: string;
  readonly memberPaths?: readonly string[];
  readonly localPackagePaths?: string[];
};

function isPreparedDependencies(value: unknown): value is PreparedDependencies {
  return (
    typeof fieldOf(value, 'kind') === 'string' &&
    typeof fieldOf(value, 'dependencyPath') === 'string'
  );
}

export function dependencyPreparationMode({
  projectRoot,
  liveProjectRoot = PACKAGE_ROOT,
  dependencyHook = resolveDependencyHook(),
}: PreparationRequest): 'existing' | 'link' | 'install' {
  if (projectRoot === liveProjectRoot) {
    return 'existing';
  }
  const [projectManifest = ''] = dependencyHook.manifests;
  if (!existsSync(containedPath(projectRoot, projectManifest))) {
    return 'link';
  }
  return dependencyManifestsDiffer(projectRoot, liveProjectRoot, dependencyHook)
    ? 'install'
    : 'link';
}

function sameFile(left: string, right: string): boolean {
  const leftExists = existsSync(left);
  if (!(leftExists && existsSync(right))) {
    return leftExists === existsSync(right);
  }
  return readFileSync(left).equals(readFileSync(right));
}

function dependencyManifestsDiffer(
  projectRoot: string,
  liveProjectRoot: string,
  dependencyHook: DependencyHook,
): boolean {
  const snapshotRoot = dependencyHook.dependencyRoot(projectRoot);
  const liveRoot = dependencyHook.dependencyRoot(liveProjectRoot);
  if (path.relative(snapshotRoot, projectRoot) !== path.relative(liveRoot, liveProjectRoot)) {
    return true;
  }
  const rootsDiffer = dependencyHook.manifests.some(
    (relativePath: string) =>
      !sameFile(containedPath(snapshotRoot, relativePath), containedPath(liveRoot, relativePath)),
  );
  const [projectManifest = ''] = dependencyHook.manifests;
  return (
    rootsDiffer ||
    !sameFile(
      containedPath(projectRoot, projectManifest),
      containedPath(liveProjectRoot, projectManifest),
    )
  );
}

export function prepareSnapshotDependencies(
  options: PreparationRequest,
): PreparedDependencies | undefined {
  const dependencyHook = options.dependencyHook ?? resolveDependencyHook();
  const mode = dependencyPreparationMode({ ...options, dependencyHook });
  if (mode === 'existing') {
    return undefined;
  }
  const liveProjectRoot = options.liveProjectRoot ?? PACKAGE_ROOT;
  const dependencyPath = containedPath(
    dependencyHook.dependencyRoot(options.projectRoot),
    dependencyHook.directory,
  );
  if (existsSync(dependencyPath)) {
    validatePreparedDependencies({ mode, dependencyPath, liveProjectRoot, dependencyHook });
    return undefined;
  }
  switch (mode) {
    case 'install':
      return dependencyHook.install(options.projectRoot, liveProjectRoot);
    case 'link':
      return linkDependencies(options, dependencyHook);
    default:
      throw new Error('Unsupported dependency preparation mode');
  }
}

function validatePreparedDependencies({
  mode,
  dependencyPath,
  liveProjectRoot,
  dependencyHook,
}: {
  readonly mode: 'link' | 'install';
  readonly dependencyPath: string;
  readonly liveProjectRoot: string;
  readonly dependencyHook: DependencyHook;
}): void {
  const entry = lstatSync(dependencyPath);
  if (mode === 'install' && entry.isDirectory() && !entry.isSymbolicLink()) {
    return;
  }
  const dependencyRoot = liveDependencyRoot(liveProjectRoot, dependencyHook);
  if (
    mode === 'link' &&
    entry.isSymbolicLink() &&
    realpathSync(dependencyPath) === dependencyRoot
  ) {
    return;
  }
  throw new Error(`Existing dependencies at ${dependencyPath} do not match the snapshot manifests`);
}

function linkDependencies(
  options: PreparationRequest,
  dependencyHook: DependencyHook,
): PreparedDependencies | undefined {
  const liveProjectRoot = options.liveProjectRoot ?? PACKAGE_ROOT;
  if (options.projectRoot === liveProjectRoot) {
    return undefined;
  }
  const dependencyRoot = liveDependencyRoot(liveProjectRoot, dependencyHook);
  const snapshotRoot = dependencyHook.dependencyRoot(options.projectRoot);
  const linkPath = containedPath(snapshotRoot, dependencyHook.directory);
  if (existsSync(linkPath)) {
    const entry = lstatSync(linkPath);
    if (entry.isSymbolicLink() && realpathSync(linkPath) === dependencyRoot) {
      return undefined;
    }
    throw new Error(`Refusing to replace existing dependencies at ${linkPath}`);
  }
  symlinkSync(dependencyRoot, linkPath, 'dir');
  const memberPaths = linkMembersOrUnlink({
    snapshotRoot,
    liveRoot: dependencyHook.dependencyRoot(liveProjectRoot),
    linkPath,
  });
  return { kind: 'linked', dependencyPath: linkPath, dependencyRoot, memberPaths };
}

function linkMembersOrUnlink({
  snapshotRoot,
  liveRoot,
  linkPath,
}: {
  readonly snapshotRoot: string;
  readonly liveRoot: string;
  readonly linkPath: string;
}): string[] {
  try {
    return linkMemberDependencies(snapshotRoot, liveRoot);
  } catch (error) {
    unlinkSync(linkPath);
    throw error;
  }
}

function liveDependencyRoot(liveProjectRoot: string, dependencyHook: DependencyHook): string {
  const dependencyPath = containedPath(
    dependencyHook.dependencyRoot(liveProjectRoot),
    dependencyHook.directory,
  );
  if (!existsSync(dependencyPath)) {
    throw new Error(
      missingDependenciesMessage(detectPackageManager(liveProjectRoot), dependencyPath),
    );
  }
  return realpathSync(dependencyPath);
}

export function removeSnapshotDependencies(dependencies: unknown): void {
  if (dependencies === undefined) {
    return;
  }
  if (!isPreparedDependencies(dependencies)) {
    throw new TypeError('The snapshot dependencies were not prepared by nitpicker');
  }
  try {
    for (const memberPath of dependencies.memberPaths ?? []) {
      removeMemberDependencies(memberPath);
    }
  } finally {
    removeRootDependencies(dependencies);
  }
}

function removeRootDependencies(dependencies: PreparedDependencies): void {
  const entry = lstatSync(dependencies.dependencyPath);
  if (dependencies.kind === 'installed') {
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      throw new Error(
        `Refusing to remove replaced dependency directory: ${dependencies.dependencyPath}`,
      );
    }
    rmSync(dependencies.dependencyPath, { recursive: true });
    removeLocalPackages(dependencies.localPackagePaths);
    return;
  }
  if (
    !entry.isSymbolicLink() ||
    realpathSync(dependencies.dependencyPath) !== dependencies.dependencyRoot
  ) {
    throw new Error(`Refusing to remove replaced dependency link: ${dependencies.dependencyPath}`);
  }
  unlinkSync(dependencies.dependencyPath);
}

function removeMemberDependencies(memberPath: string): void {
  if (!existsSync(memberPath)) {
    return;
  }
  const entry = lstatSync(memberPath);
  if (!entry.isDirectory() || entry.isSymbolicLink()) {
    throw new Error(`Refusing to remove replaced member dependencies: ${memberPath}`);
  }
  rmSync(memberPath, { recursive: true });
}
