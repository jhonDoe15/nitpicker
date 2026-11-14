import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import path from 'node:path';
import { TEMPORARY_WORKTREE_PREFIX } from '../../../../core/diff/git/repository/worktree.mjs';
import { containedPath } from './package-managers/contained-path.mts';
import { manifestDirectories } from './package-managers/members.mts';
import { fieldOf, fieldsOf } from '../../../../shared/values/readers.mts';
import { GIT_TIMEOUT_MS } from '../../../../shared/processes/deadlines.mjs';

const LOCAL_SPEC = /^(?:file|link|portal):(?<target>.+)$/u;
const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
];
type MirrorSource = {
  scratchRoot: string;
  snapshotRepository: string;
  liveRepository: string;
};

const UNCOPIED_FOLDERS = new Set(['node_modules', '.git']);

function repositoryRoot(directory: string): string | undefined {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: directory,
    encoding: 'utf8',
    timeout: GIT_TIMEOUT_MS,
  });
  return result.status === 0 ? realpathSync(result.stdout.trim()) : undefined;
}

function isInside(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function parsedManifest(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function manifestTargets(root: string, directory: string): string[] {
  const manifestFile = containedPath(root, path.join(directory, 'package.json'));
  if (!existsSync(manifestFile)) {
    return [];
  }
  const manifest = parsedManifest(manifestFile);
  return DEPENDENCY_FIELDS.flatMap((field) => Object.values(fieldsOf(fieldOf(manifest, field))))
    .map((spec) =>
      typeof spec === 'string' ? LOCAL_SPEC.exec(spec)?.groups?.['target'] : undefined,
    )
    .filter((target) => target !== undefined && !path.isAbsolute(target))
    .map((target) => path.resolve(root, directory, target ?? ''));
}

function localPackageTargets(root: string): string[] {
  const directories = ['.', ...manifestDirectories(root)];
  return [...new Set(directories.flatMap((directory) => manifestTargets(root, directory)))];
}

function mirrorSource(root: string, liveProjectRoot: string | undefined): MirrorSource | undefined {
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

function livePath(target: string, source: MirrorSource): string {
  const fromRepository = path.relative(source.snapshotRepository, target);
  return containedPath(
    path.dirname(source.liveRepository),
    path.join(path.basename(source.liveRepository), fromRepository),
  );
}

function copyFromLive(target: string, source: MirrorSource): boolean {
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
    filter: (file: string) => !UNCOPIED_FOLDERS.has(path.basename(file)),
  });
  return true;
}

export function prepareLocalPackages(
  snapshotRoot: string,
  liveProjectRoot: string | undefined,
): { copied: string[]; missing: string[] } {
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

export function removeLocalPackages(copied: string[] = []): void {
  for (const target of copied) {
    rmSync(target, { recursive: true, force: true });
  }
}
