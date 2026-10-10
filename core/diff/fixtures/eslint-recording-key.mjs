import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

// Shared by replay-eslint-cli.mjs and record-eslint-reports.mjs: what identifies the snapshot an
// ESLint report was recorded from.

const toolRoot = path.resolve(import.meta.dirname, '../../..');

// Packages whose version changes what ESLint reports for the test policies. Add every ESLint plugin
// a policy used by a replayed test loads (the tests' policies load only typescript-eslint).
export const trackedPackages = [
  'eslint',
  'typescript-eslint',
  '@typescript-eslint/parser',
  '@typescript-eslint/eslint-plugin',
  'typescript',
];

export function installedVersions() {
  return Object.fromEntries(
    trackedPackages.map((name) => {
      const manifestPath = path.join(toolRoot, 'node_modules', name, 'package.json');
      const version = existsSync(manifestPath)
        ? JSON.parse(readFileSync(manifestPath, 'utf8')).version
        : 'not installed';
      return [name, version];
    }),
  );
}

export function differingVersions(recorded, installed) {
  return trackedPackages
    .filter((name) => recorded?.[name] !== installed[name])
    .map((name) => `${name} ${recorded?.[name] ?? 'unrecorded'} -> ${installed[name]}`);
}

export function eslintCliPath() {
  return path.join(toolRoot, 'node_modules/eslint/bin/eslint.js');
}

export function snapshotKey(projectRoot, policyConfigPath) {
  return {
    policyConfig: path.basename(policyConfigPath),
    policySha: sha256(readFileSync(policyConfigPath)),
    files: sourceHashes(projectRoot, path.join(projectRoot, 'src/main')),
  };
}

export function sameKey(left, right) {
  const leftPaths = Object.keys(left.files);
  return (
    left.policySha === right.policySha &&
    leftPaths.length === Object.keys(right.files).length &&
    leftPaths.every((relativePath) => right.files[relativePath] === left.files[relativePath])
  );
}

function sourceHashes(projectRoot, directory) {
  const hashes = {};
  for (const filePath of typescriptFiles(directory)) {
    hashes[path.relative(projectRoot, filePath).split(path.sep).join('/')] = sha256(
      readFileSync(filePath),
    );
  }
  return hashes;
}

function typescriptFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const entryPath = path.join(directory, entry);
    if (statSync(entryPath).isDirectory()) {
      return typescriptFiles(entryPath);
    }
    return entryPath.endsWith('.ts') ? [entryPath] : [];
  });
}

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
}
