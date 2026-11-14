import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { filesUnder } from '../../../shared/filesystem.mjs';
import { PACKAGE_ROOT } from '../../tooling/tool-resolution.mjs';

type DirectoryEntry = { readonly name: string };

const filesBelow: (
  root: string,
  options: { readonly skipDirectory: (absolute: string, entry: DirectoryEntry) => boolean },
) => Iterable<string> = filesUnder;

const UNSHIPPED_DIRECTORIES = new Set(['fixtures', 'test-support', '__tests__', '__pycache__']);
const TEST_MODULE = /\.test\.m[jt]s$/u;
const MODULE = /\.m[jt]s$/u;

export function nitpickerCodeFingerprint(): string {
  return fingerprintPackageCode(PACKAGE_ROOT);
}

export function fingerprintPackageCode(packageRoot: string): string {
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

function shippedCodeFiles(packageRoot: string, directory: string): string[] {
  const files = filesBelow(path.join(packageRoot, directory), {
    skipDirectory: (_absolute: string, entry: DirectoryEntry) =>
      UNSHIPPED_DIRECTORIES.has(entry.name),
  });
  return [...files]
    .filter((file) => isShippedCode(directory, file))
    .map((file) => path.relative(packageRoot, file).split(path.sep).join('/'));
}

function isShippedCode(directory: string, file: string): boolean {
  return (
    !TEST_MODULE.test(file) &&
    !file.endsWith('.pyc') &&
    path.basename(file) !== 'README.md' &&
    (directory === 'languages' || MODULE.test(file))
  );
}
