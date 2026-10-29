import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const MAX_BUFFER = 1024 * 1024 * 1024;
const SYMLINK_MODE = '120000';
const PLAN_INPUT_NAMES = new Set(['Pipfile', 'setup.py', 'setup.cfg', 'requirements.txt']);
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

export function isPlanInput(file) {
  return (
    PLAN_INPUT_NAMES.has(path.posix.basename(file)) ||
    PLAN_INPUT_EXTENSIONS.has(path.posix.extname(file))
  );
}

export function canChangePlan(file) {
  return isPlanInput(file) || DETECTION_SOURCE.test(file);
}

function git(repositoryRoot, args, input) {
  const result = spawnSync('git', args, {
    cwd: repositoryRoot,
    input,
    maxBuffer: MAX_BUFFER,
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.toString().trim()}`);
  }
  return result.stdout;
}

function treeEntries(repositoryRoot, sha) {
  return git(repositoryRoot, ['ls-tree', '-r', '-z', '--full-tree', sha])
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map((line) => {
      const tab = line.indexOf('\t');
      const [mode, type, object] = line.slice(0, tab).split(' ');
      return { mode, type, object, file: line.slice(tab + 1) };
    })
    .filter(({ type }) => type === 'blob');
}

function blobContents(repositoryRoot, objects) {
  const output = git(repositoryRoot, ['cat-file', '--batch'], `${objects.join('\n')}\n`);
  const contents = new Map();
  let offset = 0;
  while (offset < output.length) {
    const lineEnd = output.indexOf(10, offset);
    const [object, , size] = output.subarray(offset, lineEnd).toString('utf8').split(' ');
    const start = lineEnd + 1;
    contents.set(object, output.subarray(start, start + Number(size)));
    offset = start + Number(size) + 1;
  }
  return contents;
}

function placed(root, file) {
  const full = path.resolve(root, file);
  if (!full.startsWith(root + path.sep)) {
    throw new Error(`${file} is outside the base tree`);
  }
  mkdirSync(path.dirname(full), { recursive: true });
  return full;
}

function writeEntry(root, entry, contents) {
  const full = placed(root, entry.file);
  if (entry.mode === SYMLINK_MODE) {
    symlinkSync(contents.get(entry.object).toString('utf8'), full);
    return;
  }
  writeFileSync(full, contents.get(entry.object) ?? '');
}

function materialize(repositoryRoot, sha, root) {
  const entries = treeEntries(repositoryRoot, sha);
  const written = entries.filter(({ file }) => canChangePlan(file));
  const read = written.filter(({ file, mode }) => isPlanInput(file) || mode === SYMLINK_MODE);
  const objects = read.map(({ object }) => object);
  const contents = objects.length === 0 ? new Map() : blobContents(repositoryRoot, objects);
  for (const entry of written) {
    writeEntry(root, entry, contents);
  }
  return entries.map(({ file }) => file);
}

export function withBaseTree({ repositoryRoot, mergeBaseSha }, operation) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-base-plan-')));
  try {
    return operation({ root, files: materialize(repositoryRoot, mergeBaseSha, root) });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
