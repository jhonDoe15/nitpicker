import { PACKAGE_ROOT } from '../../../../core/tooling/tool-resolution.mjs';
import { resolveDependencyHook } from '../dependency-graph/dependency-hooks.mjs';
import { detectPackageManager } from '../dependency-graph/package-managers/detect.mjs';
import { containedPath } from '../dependency-graph/package-managers/contained-path.mjs';
import { missingDependenciesMessage } from '../dependency-graph/package-managers/install.mjs';
import { linkMemberDependencies } from '../dependency-graph/package-managers/member-links.mjs';
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

export function dependencyPreparationMode({
  projectRoot,
  liveProjectRoot = PACKAGE_ROOT,
  dependencyHook = resolveDependencyHook(),
}) {
  if (projectRoot === liveProjectRoot) {
    return 'existing';
  }
  if (!existsSync(path.join(projectRoot, dependencyHook.manifests[0]))) {
    return 'link';
  }
  return dependencyManifestsDiffer(projectRoot, liveProjectRoot, dependencyHook)
    ? 'install'
    : 'link';
}

function sameFile(left, right) {
  const leftExists = existsSync(left);
  if (!leftExists || !existsSync(right)) {
    return leftExists === existsSync(right);
  }
  return readFileSync(left).equals(readFileSync(right));
}

function dependencyManifestsDiffer(projectRoot, liveProjectRoot, dependencyHook) {
  const snapshotRoot = dependencyHook.dependencyRoot(projectRoot);
  const liveRoot = dependencyHook.dependencyRoot(liveProjectRoot);
  if (path.relative(snapshotRoot, projectRoot) !== path.relative(liveRoot, liveProjectRoot)) {
    return true;
  }
  const rootsDiffer = dependencyHook.manifests.some(
    (relativePath) =>
      !sameFile(containedPath(snapshotRoot, relativePath), containedPath(liveRoot, relativePath)),
  );
  const projectManifest = dependencyHook.manifests[0];
  return (
    rootsDiffer ||
    !sameFile(
      containedPath(projectRoot, projectManifest),
      containedPath(liveProjectRoot, projectManifest),
    )
  );
}

export function prepareSnapshotDependencies(options) {
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
      return dependencyHook.install(options.projectRoot);
    case 'link':
      return linkDependencies(options, dependencyHook);
    default:
      throw new Error('Unsupported dependency preparation mode');
  }
}

function validatePreparedDependencies({ mode, dependencyPath, liveProjectRoot, dependencyHook }) {
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

function linkDependencies(options, dependencyHook) {
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
  const memberPaths = linkMembersOrUnlink(snapshotRoot, liveProjectRoot, dependencyHook, linkPath);
  return { kind: 'linked', dependencyPath: linkPath, dependencyRoot, memberPaths };
}

function linkMembersOrUnlink(snapshotRoot, liveProjectRoot, dependencyHook, linkPath) {
  try {
    return linkMemberDependencies(snapshotRoot, dependencyHook.dependencyRoot(liveProjectRoot));
  } catch (error) {
    unlinkSync(linkPath);
    throw error;
  }
}

function liveDependencyRoot(liveProjectRoot, dependencyHook) {
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

export function removeSnapshotDependencies(dependencies) {
  if (dependencies === undefined) {
    return;
  }
  try {
    for (const memberPath of dependencies.memberPaths ?? []) {
      removeMemberDependencies(memberPath);
    }
  } finally {
    removeRootDependencies(dependencies);
  }
}

function removeRootDependencies(dependencies) {
  const entry = lstatSync(dependencies.dependencyPath);
  if (dependencies.kind === 'installed') {
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      throw new Error(
        `Refusing to remove replaced dependency directory: ${dependencies.dependencyPath}`,
      );
    }
    rmSync(dependencies.dependencyPath, { recursive: true });
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

function removeMemberDependencies(memberPath) {
  if (!existsSync(memberPath)) {
    return;
  }
  const entry = lstatSync(memberPath);
  if (!entry.isDirectory() || entry.isSymbolicLink()) {
    throw new Error(`Refusing to remove replaced member dependencies: ${memberPath}`);
  }
  rmSync(memberPath, { recursive: true });
}
