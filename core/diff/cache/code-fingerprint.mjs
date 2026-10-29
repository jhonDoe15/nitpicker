import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
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

function insidePackage(packageRoot, file) {
  const full = path.resolve(packageRoot, file);
  if (!full.startsWith(`${packageRoot}${path.sep}`) || !existsSync(full)) {
    return undefined;
  }
  return full;
}

function walkedFiles(packageRoot, folders) {
  return folders.flatMap((folder) => {
    const directory = insidePackage(packageRoot, folder);
    if (directory === undefined || !statSync(directory).isDirectory()) {
      return [];
    }
    return readdirSync(directory, { recursive: true })
      .map((name) => `${folder}/${String(name).split(path.sep).join('/')}`)
      .filter((file) => statSync(insidePackage(packageRoot, file)).isFile());
  });
}

function shippedFiles(packageRoot, patterns) {
  const included = patterns.filter((pattern) => !pattern.startsWith('!'));
  const excluded = patterns.filter((pattern) => pattern.startsWith('!'));
  const including = included.map((pattern) => globMatcher(pattern));
  const excluding = excluded.map((pattern) => globMatcher(pattern.slice(1)));
  const folders = [...new Set(included.map((pattern) => pattern.split('/')[0]))];
  const candidates = checkoutFiles(packageRoot) ?? walkedFiles(packageRoot, folders);
  return candidates
    .filter(
      (file) =>
        including.some((matcher) => matcher.test(file)) &&
        !excluding.some((matcher) => matcher.test(file)),
    )
    .map((file) => ({ file, full: insidePackage(packageRoot, file) }))
    .filter(({ full }) => full !== undefined && statSync(full).isFile());
}

export function computeCodeFingerprint(packageDirectory) {
  const packageRoot = path.resolve(packageDirectory);
  const manifestText = readFileSync(path.join(packageRoot, 'package.json'));
  const hash = createHash('sha256').update(manifestText);
  const patterns = JSON.parse(manifestText.toString('utf8')).files ?? [];
  const files = shippedFiles(packageRoot, patterns).toSorted((left, right) =>
    left.file < right.file ? -1 : Number(left.file > right.file),
  );
  for (const { file, full } of files) {
    hash.update(`\0${file}\0`).update(readFileSync(full));
  }
  return hash.digest('hex');
}

export function currentCodeFingerprint(packageRoot = PACKAGE_ROOT) {
  if (!fingerprints.has(packageRoot)) {
    fingerprints.set(packageRoot, computeCodeFingerprint(packageRoot));
  }
  return fingerprints.get(packageRoot);
}
