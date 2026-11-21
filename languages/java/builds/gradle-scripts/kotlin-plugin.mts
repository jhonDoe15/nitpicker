import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  filesUnder as untypedFilesUnder,
  pathInside as untypedPathInside,
} from '../../../../shared/filesystem.mts';
import { fieldOf, fieldsOf, textOf } from '../../../../shared/values/readers.mts';

type Catalog = { readonly name: string; readonly file: string };
type PluginEntry = {
  readonly reference: string;
  readonly id: string | undefined;
  readonly error?: unknown;
};

const filesUnder: (
  root: string,
  options: {
    readonly skipDirectory: (absolute: string, entry: { readonly name: string }) => boolean;
  },
) => Iterable<string> = untypedFilesUnder;
const pathInside: (root: string, relative: string) => string | undefined = untypedPathInside;

export const BUILD_LOGIC_FOLDERS = ['buildSrc', 'build-logic'];
const PLUGIN_IDS = new Set([
  'org.jetbrains.kotlin.jvm',
  'org.jetbrains.kotlin.multiplatform',
  'org.jetbrains.kotlin.android',
  'kotlin',
  'kotlin-multiplatform',
  'kotlin-android',
]);
const SKIPPED_FOLDERS = new Set(['build', 'node_modules', 'out', 'target']);
const BUILD_SCRIPT = /\.gradle(?:\.kts)?$/u;
const SETTINGS_SCRIPT = /^settings\.gradle(?:\.kts)?$/u;
const CONVENTION_SOURCE = /\.kt$/u;
const DEFAULT_CATALOG = { name: 'libs', file: 'gradle/libs.versions.toml' };
const KOTLIN_ACCESSOR = /\bkotlin\s*\(\s*["'](?:jvm|multiplatform|android)["']\s*\)/u;
const PLUGIN_BY_ID = /\bid(?:\s*\(\s*|\s+)["'](?<id>[\w.-]+)["']/gu;
const PLUGIN_BY_APPLY = /\bapply(?:\s*\(\s*|\s+)(?:plugin\s*[:=]\s*)?["'](?<id>[\w.-]+)["']/gu;
const PLUGIN_BY_ALIAS = /\balias(?:\s*\(\s*|\s+)(?<catalog>\w+)\.plugins\.(?<accessor>[\w.]+)/gu;
const NOT_APPLIED = /\bapply(?:\s*\(\s*|\s+)false\b/u;
const CATALOG_FROM_FILE =
  /\b(?:create\s*\(\s*["'](?<named>\w+)["']\s*\)|(?<plain>\w+))\s*\{\s*from\s*\(\s*files\s*\(\s*["'](?<file>[^"']+)["']/gu;
const INLINE_PLUGIN = /\bplugin\s*\(\s*["'](?<alias>[\w.-]+)["']\s*,\s*["'](?<id>[\w.-]+)["']/gu;

export function projectFiles(projectRoot: string, pattern: RegExp): string[] {
  const files = filesUnder(projectRoot, {
    skipDirectory: (_absolute, entry) =>
      entry.name.startsWith('.') || SKIPPED_FOLDERS.has(entry.name),
  });
  return [...files].filter((file) => pattern.test(path.basename(file)));
}

function accessorOf(alias: string): string {
  return alias.replaceAll(/[-_.]+/gu, '.');
}

function pluginId(entry: unknown): string | undefined {
  if (typeof entry === 'string') {
    return entry.split(':')[0];
  }
  const id = fieldOf(entry, 'id');
  return typeof id === 'string' ? id : undefined;
}

function catalogPlugins(projectRoot: string, catalog: Catalog): PluginEntry[] {
  const file = pathInside(projectRoot, catalog.file);
  if (file === undefined || !existsSync(file)) {
    return [];
  }
  try {
    const toml: unknown = createRequire(import.meta.url)('smol-toml');
    const parse = fieldOf(toml, 'parse');
    if (typeof parse !== 'function') {
      throw new TypeError('smol-toml has no parse');
    }
    const parsed: unknown = Reflect.apply(parse, toml, [readFileSync(file, 'utf8')]);
    const plugins = fieldsOf(fieldOf(parsed, 'plugins'));
    return Object.entries(plugins).map(([alias, entry]) => ({
      reference: `${catalog.name}.${accessorOf(alias)}`,
      id: pluginId(entry),
    }));
  } catch (error) {
    return [{ reference: `${catalog.name}.unreadable`, id: undefined, error }];
  }
}

function declaredCatalogs(settings: string): Catalog[] {
  return [...settings.matchAll(CATALOG_FROM_FILE)].map(({ groups }) => ({
    name: textOf(groups?.['named'] ?? groups?.['plain']),
    file: textOf(groups?.['file']),
  }));
}

function inlinePlugins(settings: string): PluginEntry[] {
  return [...settings.matchAll(INLINE_PLUGIN)].map(({ groups }) => ({
    reference: `libs.${accessorOf(textOf(groups?.['alias']))}`,
    id: textOf(groups?.['id']),
  }));
}

function kotlinAliases(projectRoot: string): Set<string> {
  const settings = projectFiles(projectRoot, SETTINGS_SCRIPT)
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
  const catalogs = [DEFAULT_CATALOG, ...declaredCatalogs(settings)];
  const entries = [
    ...catalogs.flatMap((catalog) => catalogPlugins(projectRoot, catalog)),
    ...inlinePlugins(settings),
  ];
  return new Set(
    entries
      .filter(({ id }) => id !== undefined && PLUGIN_IDS.has(id))
      .map(({ reference }) => reference),
  );
}

function appliesOnLine(line: string, aliases: ReadonlySet<string>): boolean {
  if (NOT_APPLIED.test(line)) {
    return false;
  }
  const ids = [...line.matchAll(PLUGIN_BY_ID), ...line.matchAll(PLUGIN_BY_APPLY)].map(
    ({ groups }) => textOf(groups?.['id']),
  );
  const references = [...line.matchAll(PLUGIN_BY_ALIAS)].map(
    ({ groups }) => `${textOf(groups?.['catalog'])}.${textOf(groups?.['accessor'])}`,
  );
  return (
    KOTLIN_ACCESSOR.test(line) ||
    ids.some((id) => PLUGIN_IDS.has(id)) ||
    references.some((reference) => aliases.has(reference))
  );
}

function conventionSources(projectRoot: string): string[] {
  return BUILD_LOGIC_FOLDERS.flatMap((folder) => {
    const directory = pathInside(projectRoot, folder);
    return directory !== undefined && existsSync(directory)
      ? projectFiles(directory, CONVENTION_SOURCE)
      : [];
  });
}

export function gradleAppliesKotlin(projectRoot: string): boolean {
  const aliases = kotlinAliases(projectRoot);
  const scripts = projectFiles(projectRoot, BUILD_SCRIPT).filter(
    (file) => !SETTINGS_SCRIPT.test(path.basename(file)),
  );
  return [...scripts, ...conventionSources(projectRoot)].some((file) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .some((line) => appliesOnLine(line, aliases)),
  );
}
