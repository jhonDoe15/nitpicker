import { existsSync } from 'node:fs';
import path from 'node:path';
import { CONFIG_FILE_NAME, isPlainObject } from '../../../shared/config.mjs';
import { TYPESCRIPT_PRESETS } from '../scopes/layout-settings.mjs';
import { validateConfig } from '../validate.mjs';
import { readLayers } from './layers.mjs';
import { rebasedSettings } from './rebase/rebase-paths.mjs';

const NOT_INHERITED = new Set(['extends', 'projects', 'preset', 'analyzers']);

function familyOf(preset) {
  return TYPESCRIPT_PRESETS.includes(preset) ? 'typescript' : preset;
}

function posix(value) {
  return value.split(path.sep).join('/');
}

function inheritedConfig(config, memberSegments) {
  if (!isPlainObject(config)) {
    return config;
  }
  const own = Object.fromEntries(Object.entries(config).filter(([key]) => !NOT_INHERITED.has(key)));
  return rebasedSettings(own, memberSegments) ?? {};
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

function failureFor(preset, settings) {
  try {
    validateConfig({ ...settings, preset });
    return undefined;
  } catch (error) {
    return error;
  }
}

function validFor(preset, settings) {
  return failureFor(preset, settings) === undefined;
}

function keptValue({ preset, rootPreset }, key, value) {
  if (validFor(preset, { [key]: value }) || !validFor(rootPreset, { [key]: value })) {
    return value;
  }
  if (Array.isArray(value)) {
    const kept = value.filter((entry) => validFor(preset, { [key]: [entry] }));
    return kept.length === 0 ? undefined : kept;
  }
  if (!isPlainObject(value)) {
    return undefined;
  }
  const kept = Object.entries(value).filter(([inner, entry]) =>
    validFor(preset, { [key]: { [inner]: entry } }),
  );
  return kept.length === 0 ? undefined : Object.fromEntries(kept);
}

function forPreset(config, presets) {
  if (!isPlainObject(config) || validFor(presets.preset, config)) {
    return config;
  }
  return Object.fromEntries(
    Object.entries(config)
      .map(([key, value]) => [key, keptValue(presets, key, value)])
      .filter(([, value]) => value !== undefined),
  );
}

export function inheritedLayers(projectRoot, { inherits, memberPreset, repositoryRoot }) {
  const layers = inheritedLayerFiles(projectRoot, inherits, { repositoryRoot });
  const rootPreset = rootPresetOf(layers);
  if (
    layers.length === 0 ||
    (rootPreset !== undefined && familyOf(memberPreset) !== familyOf(rootPreset))
  ) {
    return { layers: [], preset: undefined };
  }
  const memberSegments = posix(
    path.relative(path.resolve(projectRoot, inherits), projectRoot),
  ).split('/');
  const preset = memberPreset ?? rootPreset;
  return {
    layers: layers.map((layer) => ({
      ...layer,
      config: forPreset(inheritedConfig(layer.config, memberSegments), { preset, rootPreset }),
    })),
    preset: rootPreset,
  };
}
