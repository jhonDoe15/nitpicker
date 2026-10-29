import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { globMatcher } from '../../../shared/paths/glob.mjs';
import { PACKAGE_ROOT } from '../../tooling/tool-resolution.mjs';

const MAX_LISTING_BYTES = 64 * 1024 * 1024;
const fingerprints = new Map();

function git(packageRoot, args) {
  const result = spawnSync('git', args, {
    cwd: packageRoot,
    encoding: 'utf8',
    maxBuffer: MAX_LISTING_BYTES,
  });
  return result.error === undefined && result.status === 0 ? result.stdout : undefined;
}

function checkoutFiles(packageRoot) {
  const topLevel = git(packageRoot, ['rev-parse', '--show-toplevel'])?.trim();
  if (topLevel === undefined || realpathSync(topLevel) !== realpathSync(packageRoot)) {
    return undefined;
  }
  return git(packageRoot, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])
    ?.split('\0')
    .filter((file) => file !== '');
}

function walkedFiles(packageRoot, folders) {
  return folders
    .filter((folder) => existsSync(path.join(packageRoot, folder)))
    .flatMap((folder) =>
      readdirSync(path.join(packageRoot, folder), { withFileTypes: true, recursive: true })
        .filter((entry) => entry.isFile())
        .map((entry) => path.relative(packageRoot, path.join(entry.parentPath, entry.name))),
    )
    .map((file) => file.split(path.sep).join('/'));
}

function shippedFiles(packageRoot, patterns) {
  const included = patterns.filter((pattern) => !pattern.startsWith('!'));
  const excluded = patterns.filter((pattern) => pattern.startsWith('!'));
  const including = included.map((pattern) => globMatcher(pattern));
  const excluding = excluded.map((pattern) => globMatcher(pattern.slice(1)));
  const folders = [...new Set(included.map((pattern) => pattern.split('/')[0]))];
  const candidates = checkoutFiles(packageRoot) ?? walkedFiles(packageRoot, folders);
  return candidates.filter(
    (file) =>
      including.some((matcher) => matcher.test(file)) &&
      !excluding.some((matcher) => matcher.test(file)) &&
      existsSync(path.join(packageRoot, file)),
  );
}

export function computeCodeFingerprint(packageRoot) {
  const manifestText = readFileSync(path.join(packageRoot, 'package.json'));
  const hash = createHash('sha256').update(manifestText);
  const patterns = JSON.parse(manifestText.toString('utf8')).files ?? [];
  for (const file of shippedFiles(packageRoot, patterns).toSorted()) {
    hash.update(`\0${file}\0`).update(readFileSync(path.join(packageRoot, file)));
  }
  return hash.digest('hex');
}

export function currentCodeFingerprint(packageRoot = PACKAGE_ROOT) {
  if (!fingerprints.has(packageRoot)) {
    fingerprints.set(packageRoot, computeCodeFingerprint(packageRoot));
  }
  return fingerprints.get(packageRoot);
}
