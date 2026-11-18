import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { ancestorDirectories as untypedAncestorDirectories } from '../../../../../../shared/filesystem.mjs';

type ManifestObject = Readonly<Record<string, unknown>>;
export type Manifest =
  | { readonly kind: 'unreadable'; readonly file: string }
  | {
      readonly kind: 'manifest';
      readonly file: string;
      readonly bundledApp: boolean;
      readonly development: ReadonlySet<string>;
      readonly runtime: ReadonlySet<string>;
    };

const ancestorDirectories: (directory: string) => string[] = untypedAncestorDirectories;

const DEVELOPMENT_SECTION = 'devDependencies';
const DEPENDENCY_SECTIONS = [
  'dependencies',
  DEVELOPMENT_SECTION,
  'peerDependencies',
  'optionalDependencies',
];
const PUBLISHED_ENTRY_FIELDS = ['main', 'module', 'exports', 'bin'];
const BUNDLER_CONFIG =
  /^(?:vite|webpack|next|rsbuild|rspack|astro|nuxt|svelte|remix|vue)\.config\./u;
const BUNDLER_PROJECT_FILES = new Set(['.parcelrc', 'angular.json']);
const BUNDLER_COMMAND =
  /(?:^|[\s;&|])(?:vite|webpack|next|rsbuild|rspack|parcel|astro|nuxt|ng|react-scripts|vue-cli-service)(?:\s|$)/u;

export function nearestManifest(directory: string): Manifest | undefined {
  for (const current of ancestorDirectories(directory)) {
    const manifest = manifestAt(current);
    if (manifest !== undefined) {
      return manifest;
    }
  }
  return undefined;
}

function manifestAt(directory: string): Manifest | undefined {
  const file = path.join(directory, 'package.json');
  if (!existsSync(file)) {
    return undefined;
  }
  const { value } = parseObject(readFileSync(file, 'utf8'));
  if (value === undefined) {
    return { kind: 'unreadable', file };
  }
  if (!DEPENDENCY_SECTIONS.some((section) => Object.hasOwn(value, section))) {
    return undefined;
  }
  return {
    kind: 'manifest',
    file,
    bundledApp: isBundledApp(directory, value),
    development: new Set(dependencyNames(value, DEVELOPMENT_SECTION)),
    runtime: new Set(
      DEPENDENCY_SECTIONS.filter((section) => section !== DEVELOPMENT_SECTION).flatMap((section) =>
        dependencyNames(value, section),
      ),
    ),
  };
}

function dependencyNames(manifest: ManifestObject, section: string): string[] {
  const entries = manifest[section];
  return typeof entries === 'object' && entries !== null ? Object.keys(entries) : [];
}

function isObjectValue(value: unknown): value is ManifestObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseObject(text: string): { value?: ManifestObject; error?: unknown } {
  try {
    const parsed: unknown = JSON.parse(text);
    return isObjectValue(parsed) ? { value: parsed } : {};
  } catch (error) {
    return { error };
  }
}

function buildScript(manifest: ManifestObject): unknown {
  const { scripts } = manifest;
  return typeof scripts === 'object' && scripts !== null
    ? Reflect.get(scripts, 'build')
    : undefined;
}

function isBundledApp(directory: string, manifest: ManifestObject): boolean {
  if (PUBLISHED_ENTRY_FIELDS.some((field) => Object.hasOwn(manifest, field))) {
    return false;
  }
  const build = buildScript(manifest);
  return (
    (typeof build === 'string' && BUNDLER_COMMAND.test(build)) ||
    readdirSync(directory).some(
      (entry) => BUNDLER_CONFIG.test(entry) || BUNDLER_PROJECT_FILES.has(entry),
    )
  );
}

export function packageNameOf(specifier: string): string | undefined {
  if (/^(?:[./#]|node:)/u.test(specifier)) {
    return undefined;
  }
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}
