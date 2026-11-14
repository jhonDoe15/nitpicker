import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { containedPath } from '../../common/contained-path.mjs';

const GIT_TIMEOUT_MS = 10_000;
const MODE_MASK = 0o777;
const OCTAL = 8;

function filesUnder(root) {
  const files = [];
  const pending = [''];
  for (const directory of pending) {
    const entries = readdirSync(directory === '' ? root : containedPath(root, directory), {
      withFileTypes: true,
    });
    for (const entry of entries.filter(({ name }) => name !== '.git')) {
      const name = directory === '' ? entry.name : `${directory}/${entry.name}`;
      if (entry.isDirectory()) {
        pending.push(name);
      } else if (entry.isFile()) {
        files.push(name);
      }
    }
  }
  return files.toSorted((left, right) => left.localeCompare(right));
}

function describeFile(root, name) {
  const file = containedPath(root, name);
  const mode = (lstatSync(file).mode & MODE_MASK).toString(OCTAL);
  return `${mode} ${readFileSync(file).toString('base64')}`;
}

export function treeOf(root) {
  return Object.fromEntries(filesUnder(root).map((name) => [name, describeFile(root, name)]));
}

export function applyPatch(root, patchFile) {
  execFileSync('git', ['apply', '--whitespace=nowarn', patchFile], {
    cwd: root,
    timeout: GIT_TIMEOUT_MS,
  });
}
