import { execFileSync } from 'node:child_process';
import { lstatSync } from 'node:fs';
import path from 'node:path';

const MAX_LISTING_BYTES = 256 * 1024 * 1024;

export function trackedFiles(root) {
  const listing = execFileSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: MAX_LISTING_BYTES,
  });
  return listing.split('\0').filter((entry) => entry.length > 0);
}

export function fileSize(root, relativePath) {
  const stats = lstatSync(path.join(root, relativePath), { throwIfNoEntry: false });
  return stats?.isFile() ? stats.size : undefined;
}
