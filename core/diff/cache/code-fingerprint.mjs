import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { filesUnder } from '../../../shared/filesystem.mjs';
import { PACKAGE_ROOT } from '../../tooling/tool-resolution.mjs';

const UNSHIPPED_DIRECTORIES = new Set(['fixtures', 'test-support', '__tests__', '__pycache__']);
let fingerprint;

export function nitpickerCodeFingerprint() {
  fingerprint ??= fingerprintPackageCode(PACKAGE_ROOT);
  return fingerprint;
}

export function fingerprintPackageCode(packageRoot) {
  const hash = createHash('sha256');
  const files = ['package.json'];
  for (const directory of ['core', 'shared', 'languages']) {
    files.push(...shippedCodeFiles(packageRoot, directory));
  }
  for (const file of files.sort()) {
    const content = readFileSync(path.join(packageRoot, file));
    hash.update(JSON.stringify([file, content.length]));
    hash.update(content);
  }
  return hash.digest('hex');
}

function shippedCodeFiles(packageRoot, directory) {
  const files = filesUnder(path.join(packageRoot, directory), {
    skipDirectory: (_absolute, entry) => UNSHIPPED_DIRECTORIES.has(entry.name),
  });
  return [...files]
    .filter((file) => isShippedCode(directory, file))
    .map((file) => path.relative(packageRoot, file).split(path.sep).join('/'));
}

function isShippedCode(directory, file) {
  return (
    !file.endsWith('.test.mjs') &&
    !file.endsWith('.pyc') &&
    path.basename(file) !== 'README.md' &&
    (directory === 'languages' || file.endsWith('.mjs'))
  );
}
