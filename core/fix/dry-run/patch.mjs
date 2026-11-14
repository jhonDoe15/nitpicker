import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GIT_TIMEOUT_MS } from '../../../shared/processes/deadlines.mjs';
import { containedPath } from '../common/contained-path.mjs';

const MAX_PATCH_BYTES = 256 * 1024 * 1024;
const DIFFERENCES_STATUS = 1;
const DIFF_ARGUMENTS = [
  '-c',
  'core.quotePath=false',
  'diff',
  '--no-index',
  '--binary',
  '--no-prefix',
  '--no-renames',
  '--no-color',
  '--no-ext-diff',
  '--no-textconv',
  'a',
  'b',
];

function place(target, entry) {
  if (entry === undefined) {
    return;
  }
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, entry.bytes);
  chmodSync(target, entry.mode);
}

function stage(root, changes) {
  mkdirSync(containedPath(root, 'a'));
  mkdirSync(containedPath(root, 'b'));
  for (const { name, before, after } of changes) {
    place(containedPath(root, `a/${name}`), before);
    place(containedPath(root, `b/${name}`), after);
  }
}

function diffOf(root) {
  const result = spawnSync('git', DIFF_ARGUMENTS, {
    cwd: root,
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: MAX_PATCH_BYTES,
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0 && result.status !== DIFFERENCES_STATUS) {
    throw new Error(`git diff failed while building fix.patch: ${result.stderr.toString('utf8')}`);
  }
  return result.stdout;
}

export function unifiedPatch(changes) {
  if (changes.length === 0) {
    return Buffer.alloc(0);
  }
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-fix-patch-'));
  try {
    stage(root, changes);
    return diffOf(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
