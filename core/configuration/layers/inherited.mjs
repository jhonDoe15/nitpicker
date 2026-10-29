import { existsSync } from 'node:fs';
import path from 'node:path';
import { CONFIG_FILE_NAME, isPlainObject } from '../../../shared/config.mjs';
import { globMatcher } from '../../../shared/paths/glob.mjs';
import { presetToDeclare } from '../project-checks/preset-detection.mjs';
import { TYPESCRIPT_PRESETS } from '../scopes/layout-settings.mjs';
import { readLayers } from './layers.mjs';

const NOT_INHERITED = new Set(['extends', 'projects', 'preset']);
const GLOB_LIST_KEYS = new Set(['exclude']);
const LAYOUT_GLOB_KEYS = new Set(['excludedGlobs', 'entryPoints', 'sharedRoots', 'featureRoots']);
const LAYOUT_FOLDER_KEYS = new Set(['sourceRoots', 'testRoots']);

function familyOf(preset) {
  return TYPESCRIPT_PRESETS.includes(preset) ? 'typescript' : preset;
}

function posix(value) {
  return value.split(path.sep).join('/');
}

function rebasedPattern(pattern, memberSegments, whole) {
  let rest = pattern.split('/');
  for (const segment of memberSegments) {
    if (rest[0] === '**') {
      return rest.join('/');
    }
    if (rest.length === 0 || !globMatcher(rest[0]).test(segment)) {
      return undefined;
    }
    rest = rest.slice(1);
  }
  return rest.length === 0 ? whole : rest.join('/');
}

function rebasedList(values, memberSegments, whole) {
  return values
    .map((value) => rebasedPattern(value, memberSegments, whole))
    .filter((value) => value !== undefined);
}

function rebasedLayout(layout, memberSegments) {
  const entries = Object.entries(layout).flatMap(([key, value]) => {
    if (LAYOUT_GLOB_KEYS.has(key)) {
      return [[key, rebasedList(value, memberSegments, '**')]];
    }
    if (!LAYOUT_FOLDER_KEYS.has(key)) {
      return [[key, value]];
    }
    const folders = rebasedList(value, memberSegments, undefined);
    return folders.length === 0 ? [] : [[key, folders]];
  });
  return entries.length === 0 ? undefined : Object.fromEntries(entries);
}

function rebasedExceptions(exceptions, memberSegments) {
  return exceptions.flatMap((exception) => {
    if (!Array.isArray(exception?.paths)) {
      return [exception];
    }
    const paths = rebasedList(exception.paths, memberSegments, '**');
    return paths.length === 0 ? [] : [{ ...exception, paths }];
  });
}

function rebasedValue(key, value, memberSegments) {
  if (GLOB_LIST_KEYS.has(key) && Array.isArray(value)) {
    return rebasedList(value, memberSegments, '**');
  }
  if (key === 'exceptions' && Array.isArray(value)) {
    return rebasedExceptions(value, memberSegments);
  }
  if (key === 'layout' && isPlainObject(value)) {
    return rebasedLayout(value, memberSegments);
  }
  if (key === 'legacyInventory' && typeof value === 'string') {
    return rebasedPattern(value, memberSegments, undefined);
  }
  return value;
}

function inheritedConfig(config, memberSegments) {
  if (!isPlainObject(config)) {
    return config;
  }
  const entries = Object.entries(config)
    .filter(([key]) => !NOT_INHERITED.has(key))
    .map(([key, value]) => [key, rebasedValue(key, value, memberSegments)])
    .filter(([, value]) => value !== undefined);
  return Object.fromEntries(entries);
}

export function inheritedLayerFiles(projectRoot, inherits, { repositoryRoot } = {}) {
  if (inherits === undefined) {
    return [];
  }
  const rootFolder = path.resolve(projectRoot, inherits);
  const configPath = path.resolve(rootFolder, CONFIG_FILE_NAME);
  if (!configPath.startsWith(rootFolder + path.sep)) {
    return [];
  }
  if (rootFolder === path.resolve(projectRoot) || !existsSync(configPath)) {
    return [];
  }
  const ownLabel = posix(path.join(inherits, CONFIG_FILE_NAME));
  return readLayers(configPath, { repositoryRoot }).map((layer) =>
    layer.label === CONFIG_FILE_NAME ? { ...layer, label: ownLabel } : layer,
  );
}

function rootPresetOf(layers) {
  return layers.reduce(
    (preset, layer) => (isPlainObject(layer.config) ? (layer.config.preset ?? preset) : preset),
    undefined,
  );
}

function rootFamilyOf(layers, rootFolder) {
  const preset = rootPresetOf(layers);
  if (preset !== undefined) {
    return familyOf(preset);
  }
  const own = layers.at(-1).config;
  return familyOf(presetToDeclare(isPlainObject(own) ? own : {}, rootFolder)?.preset);
}

export function inheritedLayers(projectRoot, { inherits, memberPreset, repositoryRoot }) {
  const layers = inheritedLayerFiles(projectRoot, inherits, { repositoryRoot });
  if (layers.length === 0) {
    return { layers: [], preset: undefined };
  }
  const rootFolder = path.resolve(projectRoot, inherits);
  if (familyOf(memberPreset) !== rootFamilyOf(layers, rootFolder)) {
    return { layers: [], preset: undefined };
  }
  const memberSegments = posix(path.relative(rootFolder, projectRoot)).split('/');
  return {
    layers: layers.map((layer) => ({
      ...layer,
      config: inheritedConfig(layer.config, memberSegments),
    })),
    preset: rootPresetOf(layers),
  };
}
