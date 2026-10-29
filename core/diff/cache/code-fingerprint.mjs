import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const SHIPPED_FOLDERS = ['core', 'shared', 'languages'];
const UNSHIPPED_FOLDERS = new Set([
  'fixtures',
  'test-support',
  '__tests__',
  '__pycache__',
  'node_modules',
]);
const UNSHIPPED_FILE = /\.test\.mjs$|\.pyc$|^README\.md$/u;

function shippedFiles(packageRoot, directory) {
  return readdirSync(directory, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && !UNSHIPPED_FILE.test(entry.name))
    .map((entry) => path.relative(packageRoot, path.join(entry.parentPath, entry.name)))
    .filter((file) => !file.split(path.sep).some((part) => UNSHIPPED_FOLDERS.has(part)));
}

export function codeFingerprint(packageRoot) {
  const hash = createHash('sha256').update(readFileSync(path.join(packageRoot, 'package.json')));
  const files = [];
  for (const folder of SHIPPED_FOLDERS) {
    const directory = path.join(packageRoot, folder);
    if (existsSync(directory)) {
      files.push(...shippedFiles(packageRoot, directory));
    }
  }
  for (const file of files.sort()) {
    hash
      .update(`\0${file.split(path.sep).join('/')}\0`)
      .update(readFileSync(path.join(packageRoot, file)));
  }
  return hash.digest('hex');
}
