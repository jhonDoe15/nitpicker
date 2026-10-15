import path from 'node:path';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import ts from 'typescript';

const packageRoot = path.resolve(import.meta.dirname, '../../../..');

function importedFiles(relativePath, source, root) {
  return ts
    .preProcessFile(source, true, true)
    .importedFiles.map(({ fileName }) => fileName)
    .filter((name) => name.startsWith('.'))
    .map((name) => path.resolve(root, path.dirname(relativePath), name.split(/[?#]/u)[0]))
    .filter((absolute) => existsSync(absolute) && statSync(absolute).isFile())
    .map((absolute) => path.relative(root, absolute).split(path.sep).join('/'))
    .filter((relative) => relative !== '..' && !relative.startsWith('../'));
}

function configurationContents(relativePaths, root) {
  const files = new Map();
  const pending = [...relativePaths];
  for (const relativePath of pending) {
    if (files.has(relativePath)) continue;
    const contents = readFileSync(path.join(root, relativePath), 'utf8');
    files.set(relativePath, contents);
    if (/\.[cm]?[jt]sx?$/u.test(relativePath))
      pending.push(...importedFiles(relativePath, contents, root));
  }
  return files;
}

export function hashFiles(relativePaths, configurationValues = [], { root = packageRoot } = {}) {
  const hash = createHash('sha256');
  const contents = configurationContents(relativePaths, root);
  for (const relativePath of [...contents.keys()].sort()) {
    hash.update(relativePath);
    hash.update('\0');
    hash.update(contents.get(relativePath));
    hash.update('\0');
  }
  for (const configurationValue of [...new Set(configurationValues)].sort()) {
    hash.update(configurationValue);
    hash.update('\0');
  }
  return hash.digest('hex');
}
