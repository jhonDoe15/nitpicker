import { execFileSync } from 'node:child_process';

const MAX_LISTING_BYTES = 256 * 1024 * 1024;
const REGULAR_FILE_MODES = new Set(['100644', '100755']);

export function git(root, gitArguments, input) {
  return execFileSync('git', gitArguments, {
    cwd: root,
    encoding: 'utf8',
    input,
    maxBuffer: MAX_LISTING_BYTES,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function nameList(listing) {
  return listing.split('\0').filter((entry) => entry.length > 0);
}

export function trackedFiles(root) {
  return nameList(git(root, ['ls-files', '-z']));
}

export function committedFiles(root, ref) {
  return nameList(git(root, ['ls-tree', '-r', '-z', '--name-only', ref, '--', '.']));
}

export function committedSizes(root) {
  const blobs = git(root, ['ls-files', '-s', '-z'])
    .split('\0')
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const tab = entry.indexOf('\t');
      const [mode, object] = entry.slice(0, tab).split(' ');
      return { mode, object, file: entry.slice(tab + 1) };
    })
    .filter(({ mode }) => REGULAR_FILE_MODES.has(mode));
  if (blobs.length === 0) {
    return new Map();
  }
  const input = `${blobs.map(({ object }) => object).join('\n')}\n`;
  const sizes = git(root, ['cat-file', '--batch-check=%(objectsize)'], input).split('\n');
  return new Map(blobs.map(({ file }, index) => [file, Number(sizes[index])]));
}
