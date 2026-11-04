import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import path from 'node:path';
import { TEMPORARY_WORKTREE_PREFIX } from '../../../../core/diff/git/repository/worktree.mjs';
import { containedPath } from './package-managers/contained-path.mjs';
import { manifestDirectories } from './package-managers/members.mjs';

const LOCAL_SPEC = /^(?:file|link|portal):(?<target>.+)$/u;
const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
];
const UNCOPIED_FOLDERS = new Set(['node_modules', '.git']);

function repositoryRoot(directory) {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: directory,
    encoding: 'utf8',
  });
  return result.status === 0 ? realpathSync(result.stdout.trim()) : undefined;
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function parsedManifest(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function manifestTargets(root, directory) {
  const manifestFile = containedPath(root, path.join(directory, 'package.json'));
  if (!existsSync(manifestFile)) {
    return [];
  }
  const manifest = parsedManifest(manifestFile);
  return DEPENDENCY_FIELDS.flatMap((field) => Object.values(manifest[field] ?? {}))
    .map((spec) => (typeof spec === 'string' ? LOCAL_SPEC.exec(spec)?.groups.target : undefined))
    .filter((target) => target !== undefined && !path.isAbsolute(target))
    .map((target) => path.resolve(root, directory, target));
}

function localPackageTargets(root) {
  const directories = ['.', ...manifestDirectories(root)];
  return [...new Set(directories.flatMap((directory) => manifestTargets(root, directory)))];
}

function mirrorSource(root, liveProjectRoot) {
  const snapshotRepository = repositoryRoot(root);
  if (liveProjectRoot === undefined || snapshotRepository === undefined) {
    return undefined;
  }
  const scratchRoot = path.dirname(snapshotRepository);
  const liveRepository = repositoryRoot(liveProjectRoot);
  if (!path.basename(scratchRoot).startsWith(TEMPORARY_WORKTREE_PREFIX) || !liveRepository) {
    return undefined;
  }
  return { scratchRoot, snapshotRepository, liveRepository };
}

function livePath(target, source) {
  const fromRepository = path.relative(source.snapshotRepository, target);
  return containedPath(
    path.dirname(source.liveRepository),
    path.join(path.basename(source.liveRepository), fromRepository),
  );
}

function copyFromLive(target, source) {
  if (existsSync(target) || !isInside(source.scratchRoot, target)) {
    return false;
  }
  const copy = containedPath(source.scratchRoot, path.relative(source.scratchRoot, target));
  const live = livePath(copy, source);
  if (!existsSync(live)) {
    return false;
  }
  cpSync(live, copy, {
    recursive: true,
    filter: (file) => !UNCOPIED_FOLDERS.has(path.basename(file)),
  });
  return true;
}

export function prepareLocalPackages(snapshotRoot, liveProjectRoot) {
  const root = realpathSync(snapshotRoot);
  const targets = localPackageTargets(root);
  const source = mirrorSource(root, liveProjectRoot);
  const copied =
    source === undefined ? [] : targets.filter((target) => copyFromLive(target, source));
  const missing = targets
    .filter((target) => !existsSync(target))
    .map((target) => path.relative(root, target));
  return { copied, missing };
}

export function removeLocalPackages(copied = []) {
  for (const target of copied) {
    rmSync(target, { recursive: true, force: true });
  }
}
