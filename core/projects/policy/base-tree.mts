import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { containedPath as untypedContainedPath } from '../../../shared/paths/contained-path.mts';
import { GIT_TIMEOUT_MS } from '../../../shared/processes/deadlines.mts';

type TreeEntry = {
  readonly mode: string;
  readonly type: string;
  readonly object: string;
  readonly file: string;
};

const containedPath: (
  root: string,
  relative: string,
  options: { readonly includeRoot?: true; readonly outside: (relative: string) => string },
) => string = untypedContainedPath;

const MAX_BUFFER = 1024 * 1024 * 1024;
const SYMLINK_MODE = '120000';
const PLAN_INPUT_NAMES = new Set([
  'Pipfile',
  'setup.py',
  'setup.cfg',
  'requirements.txt',
  '.gitmodules',
]);
const PLAN_INPUT_EXTENSIONS = new Set([
  '.json',
  '.toml',
  '.yaml',
  '.yml',
  '.gradle',
  '.kts',
  '.xml',
]);
const DETECTION_SOURCE = /\.(?:[cm]?[jt]sx?|kt|java)$/u;

export function isPlanInput(file: string): boolean {
  return (
    PLAN_INPUT_NAMES.has(path.posix.basename(file)) ||
    PLAN_INPUT_EXTENSIONS.has(path.posix.extname(file))
  );
}

export function canChangePlan(file: string): boolean {
  return isPlanInput(file) || DETECTION_SOURCE.test(file);
}

function git(repositoryRoot: string, args: readonly string[], input?: string): Buffer {
  const result = spawnSync('git', args, {
    cwd: repositoryRoot,
    input,
    maxBuffer: MAX_BUFFER,
    timeout: GIT_TIMEOUT_MS,
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.toString().trim()}`);
  }
  return result.stdout;
}

function treeEntries(repositoryRoot: string, sha: string): TreeEntry[] {
  return git(repositoryRoot, ['ls-tree', '-r', '-z', '--full-tree', sha])
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map((line) => {
      const tab = line.indexOf('\t');
      const [mode = '', type = '', object = ''] = line.slice(0, tab).split(' ');
      return { mode, type, object, file: line.slice(tab + 1) };
    })
    .filter(({ type }) => type === 'blob');
}

function blobContents(repositoryRoot: string, objects: readonly string[]): Map<string, Buffer> {
  const output = git(repositoryRoot, ['cat-file', '--batch'], `${objects.join('\n')}\n`);
  const contents = new Map<string, Buffer>();
  let offset = 0;
  for (const object of objects) {
    const lineEnd = output.indexOf(10, offset);
    const size = Number(output.subarray(offset, lineEnd).toString('utf8').split(' ')[2]);
    const start = lineEnd + 1;
    contents.set(object, output.subarray(start, start + size));
    offset = start + size + 1;
  }
  return contents;
}

function outsideTree(relative: string): string {
  return `${relative} is outside the base tree`;
}

function placedFolder(root: string, folder: string): string {
  return containedPath(root, folder, { includeRoot: true, outside: outsideTree });
}

function placed(root: string, file: string): string {
  const full = containedPath(root, file, { outside: outsideTree });
  mkdirSync(path.dirname(full), { recursive: true });
  return full;
}

function writeEntry(root: string, entry: TreeEntry, contents: ReadonlyMap<string, Buffer>): void {
  const full = placed(root, entry.file);
  if (entry.mode === SYMLINK_MODE) {
    symlinkSync(contents.get(entry.object)?.toString('utf8') ?? '', full);
    return;
  }
  writeFileSync(full, contents.get(entry.object) ?? '');
}

function materialize(repositoryRoot: string, sha: string, root: string): string[] {
  const entries = treeEntries(repositoryRoot, sha);
  const written = entries.filter(({ file }) => canChangePlan(file));
  const read = written.filter(({ file, mode }) => isPlanInput(file) || mode === SYMLINK_MODE);
  const objects = read.map(({ object }) => object);
  const contents =
    objects.length === 0 ? new Map<string, Buffer>() : blobContents(repositoryRoot, objects);
  for (const folder of new Set(entries.map(({ file }) => path.posix.dirname(file)))) {
    mkdirSync(placedFolder(root, folder), { recursive: true });
  }
  for (const entry of written) {
    writeEntry(root, entry, contents);
  }
  return entries.map(({ file }) => file);
}

export function withBaseTree<Result>(
  {
    repositoryRoot,
    mergeBaseSha,
  }: { readonly repositoryRoot: string; readonly mergeBaseSha: string },
  operation: (tree: { readonly root: string; readonly files: string[] }) => Result,
): Result {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-base-plan-')));
  try {
    return operation({ root, files: materialize(repositoryRoot, mergeBaseSha, root) });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
