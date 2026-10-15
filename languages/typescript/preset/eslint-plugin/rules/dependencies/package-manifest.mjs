import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const DEPENDENCY_SECTIONS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];
const PUBLISHED_ENTRY_FIELDS = ['main', 'module', 'exports', 'bin'];
const BUNDLER_CONFIG =
  /^(?:vite|webpack|next|rsbuild|rspack|astro|nuxt|svelte|remix|vue)\.config\./u;
const BUNDLER_PROJECT_FILES = new Set(['.parcelrc', 'angular.json']);
const BUNDLER_COMMAND =
  /(?:^|[\s;&|])(?:vite|webpack|next|rsbuild|rspack|parcel|astro|nuxt|ng|react-scripts|vue-cli-service)(?:\s|$)/u;

const manifests = new Map();

export function nearestManifest(directory) {
  if (!manifests.has(directory)) {
    manifests.set(directory, findManifest(directory));
  }
  return manifests.get(directory);
}

function findManifest(directory) {
  const file = path.join(directory, 'package.json');
  if (!existsSync(file)) {
    return parentManifest(directory);
  }
  const { value } = parseObject(readFileSync(file, 'utf8'));
  if (value === undefined) {
    return { kind: 'unreadable', file };
  }
  if (!DEPENDENCY_SECTIONS.some((section) => Object.hasOwn(value, section))) {
    return parentManifest(directory);
  }
  return {
    kind: 'manifest',
    file,
    bundledApp: isBundledApp(directory, value),
    development: new Set(Object.keys(value.devDependencies ?? {})),
    runtime: new Set(
      DEPENDENCY_SECTIONS.filter((section) => section !== 'devDependencies').flatMap((section) =>
        Object.keys(value[section] ?? {}),
      ),
    ),
  };
}

function parentManifest(directory) {
  const parent = path.dirname(directory);
  return parent === directory ? undefined : nearestManifest(parent);
}

function parseObject(text) {
  try {
    const parsed = JSON.parse(text);
    const isObject = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);
    return isObject ? { value: parsed } : {};
  } catch (error) {
    return { error };
  }
}

function isBundledApp(directory, manifest) {
  if (PUBLISHED_ENTRY_FIELDS.some((field) => Object.hasOwn(manifest, field))) {
    return false;
  }
  const build = manifest.scripts?.build;
  return (
    (typeof build === 'string' && BUNDLER_COMMAND.test(build)) ||
    readdirSync(directory).some(
      (entry) => BUNDLER_CONFIG.test(entry) || BUNDLER_PROJECT_FILES.has(entry),
    )
  );
}

export function packageNameOf(specifier) {
  if (/^(?:[./#]|node:)/u.test(specifier)) {
    return undefined;
  }
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}
