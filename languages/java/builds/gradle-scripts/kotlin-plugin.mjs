import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'smol-toml';
import { filesUnder, pathInside } from '../../../../shared/filesystem.mjs';

export const KOTLIN_JVM_PLUGIN = 'org.jetbrains.kotlin.jvm';
export const BUILD_LOGIC_FOLDERS = ['buildSrc', 'build-logic'];
const PLUGIN_IDS = new Set([KOTLIN_JVM_PLUGIN, 'kotlin']);
const SKIPPED_FOLDERS = new Set(['build', 'node_modules', 'out', 'target']);
const BUILD_SCRIPT = /\.gradle(?:\.kts)?$/u;
const SETTINGS_SCRIPT = /^settings\.gradle(?:\.kts)?$/u;
const CONVENTION_SOURCE = /\.kt$/u;
const DEFAULT_CATALOG = { name: 'libs', file: 'gradle/libs.versions.toml' };
const KOTLIN_JVM_ACCESSOR = /\bkotlin\s*\(\s*["']jvm["']\s*\)/u;
const PLUGIN_BY_ID = /\bid(?:\s*\(\s*|\s+)["'](?<id>[\w.-]+)["']/gu;
const PLUGIN_BY_APPLY = /\bapply(?:\s*\(\s*|\s+)(?:plugin\s*[:=]\s*)?["'](?<id>[\w.-]+)["']/gu;
const PLUGIN_BY_ALIAS = /\balias(?:\s*\(\s*|\s+)(?<catalog>\w+)\.plugins\.(?<accessor>[\w.]+)/gu;
const NOT_APPLIED = /\bapply(?:\s*\(\s*|\s+)false\b/u;
const CATALOG_FROM_FILE =
  /\b(?:create\s*\(\s*["'](?<named>\w+)["']\s*\)|(?<plain>\w+))\s*\{\s*from\s*\(\s*files\s*\(\s*["'](?<file>[^"']+)["']/gu;
const INLINE_PLUGIN = /\bplugin\s*\(\s*["'](?<alias>[\w.-]+)["']\s*,\s*["'](?<id>[\w.-]+)["']/gu;

function projectFiles(projectRoot, pattern) {
  const files = filesUnder(projectRoot, {
    skipDirectory: (_absolute, entry) =>
      entry.name.startsWith('.') || SKIPPED_FOLDERS.has(entry.name),
  });
  return [...files].filter((file) => pattern.test(path.basename(file)));
}

function accessorOf(alias) {
  return alias.replaceAll(/[-_.]+/gu, '.');
}

function pluginId(entry) {
  if (typeof entry === 'string') {
    return entry.split(':')[0];
  }
  return typeof entry?.id === 'string' ? entry.id : undefined;
}

function catalogPlugins(projectRoot, catalog) {
  const file = pathInside(projectRoot, catalog.file);
  if (file === undefined || !existsSync(file)) {
    return [];
  }
  try {
    const plugins = parse(readFileSync(file, 'utf8')).plugins ?? {};
    return Object.entries(plugins).map(([alias, entry]) => ({
      reference: `${catalog.name}.${accessorOf(alias)}`,
      id: pluginId(entry),
    }));
  } catch (error) {
    return [{ reference: `${catalog.name}.unreadable`, id: undefined, error }];
  }
}

function declaredCatalogs(settings) {
  return [...settings.matchAll(CATALOG_FROM_FILE)].map(({ groups }) => ({
    name: groups.named ?? groups.plain,
    file: groups.file,
  }));
}

function inlinePlugins(settings) {
  return [...settings.matchAll(INLINE_PLUGIN)].map(({ groups }) => ({
    reference: `libs.${accessorOf(groups.alias)}`,
    id: groups.id,
  }));
}

function kotlinAliases(projectRoot) {
  const settings = projectFiles(projectRoot, SETTINGS_SCRIPT)
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
  const catalogs = [DEFAULT_CATALOG, ...declaredCatalogs(settings)];
  const entries = [
    ...catalogs.flatMap((catalog) => catalogPlugins(projectRoot, catalog)),
    ...inlinePlugins(settings),
  ];
  return new Set(entries.filter(({ id }) => PLUGIN_IDS.has(id)).map(({ reference }) => reference));
}

function appliesOnLine(line, aliases) {
  if (NOT_APPLIED.test(line)) {
    return false;
  }
  const ids = [...line.matchAll(PLUGIN_BY_ID), ...line.matchAll(PLUGIN_BY_APPLY)].map(
    ({ groups }) => groups.id,
  );
  const references = [...line.matchAll(PLUGIN_BY_ALIAS)].map(
    ({ groups }) => `${groups.catalog}.${groups.accessor}`,
  );
  return (
    KOTLIN_JVM_ACCESSOR.test(line) ||
    ids.some((id) => PLUGIN_IDS.has(id)) ||
    references.some((reference) => aliases.has(reference))
  );
}

function conventionSources(projectRoot) {
  return BUILD_LOGIC_FOLDERS.flatMap((folder) => {
    const directory = pathInside(projectRoot, folder);
    return directory !== undefined && existsSync(directory)
      ? projectFiles(directory, CONVENTION_SOURCE)
      : [];
  });
}

export function gradleAppliesKotlin(projectRoot) {
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
