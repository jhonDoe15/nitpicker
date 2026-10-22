import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathInside } from '../../filesystem.mjs';

const LOCK_FILES = new Set([
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lock',
  'bun.lockb',
  'deno.lock',
  'gradle.lockfile',
  'settings-gradle.lockfile',
  'Cargo.lock',
  'poetry.lock',
  'uv.lock',
  'Pipfile.lock',
  'pdm.lock',
  'composer.lock',
  'Gemfile.lock',
  'go.sum',
  'packages.lock.json',
  'Podfile.lock',
  'pubspec.lock',
  'mix.lock',
  'flake.lock',
]);
const TOOLING_PATHS = [
  /(?:^|\/)gradle\/wrapper\/gradle-wrapper\.jar$/u,
  /(?:^|\/)\.mvn\/wrapper\/maven-wrapper\.jar$/u,
  /(?:^|\/)\.yarn\/(?:releases|plugins|cache)\//u,
  /(?:^|\/)\.pnp\.(?:cjs|loader\.mjs)$/u,
];
const KEY_FILE = /^id_(?:rsa|dsa|ecdsa|ed25519)$|\.(?:p12|pfx|jks|keystore|ppk)$/iu;
const TRUST_STORE = /truststore|cacerts/iu;
const DEPENDENCY_SECTIONS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
];

export function isLockFile(base) {
  return LOCK_FILES.has(base);
}

export function isKeyFileName(base) {
  return KEY_FILE.test(base) && !TRUST_STORE.test(base);
}

export function committedTooling(projectRoot, files) {
  const packedDependencies = new Set(
    files
      .filter((file) => path.posix.basename(file) === 'package.json')
      .flatMap((manifest) => localPackageFiles(projectRoot, manifest)),
  );
  return (file) =>
    packedDependencies.has(file) || TOOLING_PATHS.some((pattern) => pattern.test(file));
}

function localPackageFiles(projectRoot, manifest) {
  const { value } = readJson(path.join(projectRoot, manifest));
  const directory = path.posix.dirname(manifest);
  return DEPENDENCY_SECTIONS.flatMap((section) => Object.values(value?.[section] ?? {}))
    .filter((spec) => typeof spec === 'string' && spec.startsWith('file:'))
    .map((spec) => path.posix.normalize(path.posix.join(directory, spec.slice('file:'.length))));
}

export function trackedText(projectRoot, file) {
  const full = pathInside(projectRoot, file);
  return full === undefined ? '' : readFileSync(full, 'utf8');
}

export function readJson(file) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return typeof parsed === 'object' && parsed !== null ? { value: parsed } : {};
  } catch (error) {
    return { error };
  }
}
