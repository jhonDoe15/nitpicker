import { PACKAGE_ROOT } from '../../../../core/tooling/tool-resolution.mjs';
import {
  installedDependencies,
  resolveDependencyHook,
} from '../dependency-graph/dependency-hooks.mjs';
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

function dependencyManifestsDiffer(projectRoot, liveProjectRoot, dependencyHook) {
  return dependencyHook.manifests.some((relativePath) => {
    const projectPath = path.join(projectRoot, relativePath);
    const policyPath = path.join(liveProjectRoot, relativePath);
    const projectManifestExists = existsSync(projectPath);
    const policyManifestExists = existsSync(policyPath);
    if (!projectManifestExists || !policyManifestExists) {
      return projectManifestExists !== policyManifestExists;
    }
    return readFileSync(projectPath, 'utf8') !== readFileSync(policyPath, 'utf8');
  });
}

export function prepareSnapshotDependencies(options) {
  const dependencyHook = options.dependencyHook ?? resolveDependencyHook();
  const mode = dependencyPreparationMode({ ...options, dependencyHook });
  if (mode === 'existing') {
    return undefined;
  }
  const dependencyPath = path.join(options.projectRoot, dependencyHook.directory);
  if (existsSync(dependencyPath)) {
    validatePreparedDependencies({
      mode,
      dependencyPath,
      liveProjectRoot: options.liveProjectRoot ?? PACKAGE_ROOT,
      dependencyHook,
    });
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
  const dependencyRoot = realpathSync(path.join(liveProjectRoot, dependencyHook.directory));
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
  const liveRoot = options.liveProjectRoot ?? PACKAGE_ROOT;
  const dependencyRoot = installedDependencies(liveRoot, dependencyHook);
  if (options.projectRoot === liveRoot || dependencyRoot === undefined) {
    return undefined;
  }
  const linkPath = path.join(options.projectRoot, dependencyHook.directory);
  if (existsSync(linkPath)) {
    const entry = lstatSync(linkPath);
    if (entry.isSymbolicLink() && realpathSync(linkPath) === dependencyRoot) {
      return undefined;
    }
    throw new Error(`Refusing to replace existing dependencies at ${linkPath}`);
  }
  symlinkSync(dependencyRoot, linkPath, 'dir');
  return { kind: 'linked', dependencyPath: linkPath, dependencyRoot };
}

export function removeSnapshotDependencies(dependencies) {
  if (dependencies === undefined) {
    return;
  }
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
