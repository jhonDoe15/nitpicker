import { existsSync } from 'node:fs';
import path from 'node:path';
import { CONFIG_FILE_NAME } from '../../../shared/config.mjs';
import type { ConfigLayer, ConfigSettings } from '../../../shared/values/config-types.mts';
import { isPlainObject, textOf } from '../../../shared/values/readers.mts';
import { TYPESCRIPT_PRESETS } from '../scopes/layout-settings.mts';
import { validateConfig } from '../validate.mts';
import { readLayers } from './layers.mjs';
import { rebasedSettings as untypedRebasedSettings } from './rebase/rebase-paths.mjs';

const rebasedSettings: (
  config: ConfigSettings,
  memberSegments: readonly string[],
) => ConfigSettings | undefined = untypedRebasedSettings;

type Presets = {
  readonly preset: string | undefined;
  readonly rootPreset: string | undefined;
};

type InheritOptions = {
  readonly inherits?: string | undefined;
  readonly memberPreset?: string | undefined;
  readonly repositoryRoot?: string | undefined;
};

export type InheritedLayers = {
  readonly layers: readonly ConfigLayer[];
  readonly preset: string | undefined;
};

const NOT_INHERITED = new Set(['extends', 'projects', 'preset', 'analyzers']);

function familyOf(preset: string | undefined): string | undefined {
  return TYPESCRIPT_PRESETS.includes(preset) ? 'typescript' : preset;
}

function posix(value: string): string {
  return value.split(path.sep).join('/');
}

function inheritedConfig(config: unknown, memberSegments: readonly string[]): unknown {
  if (!isPlainObject(config)) {
    return config;
  }
  const own = Object.fromEntries(Object.entries(config).filter(([key]) => !NOT_INHERITED.has(key)));
  return rebasedSettings(own, memberSegments) ?? {};
}

export function inheritedLayerFiles(
  projectRoot: string,
  inherits: string | undefined,
  { repositoryRoot }: { readonly repositoryRoot?: string | undefined } = {},
): readonly ConfigLayer[] {
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

function presetOf(value: unknown): string | undefined {
  return value === undefined ? undefined : textOf(value);
}

function rootPresetOf(layers: readonly ConfigLayer[]): string | undefined {
  return layers.reduce<string | undefined>(
    (preset, layer) =>
      isPlainObject(layer.config) ? (presetOf(layer.config['preset']) ?? preset) : preset,
    undefined,
  );
}

function failureFor(preset: string | undefined, settings: ConfigSettings): unknown {
  try {
    validateConfig({ ...settings, preset });
    return undefined;
  } catch (error) {
    return error;
  }
}

function validFor(preset: string | undefined, settings: ConfigSettings): boolean {
  return failureFor(preset, settings) === undefined;
}

function keptValue({ preset, rootPreset }: Presets, key: string, value: unknown): unknown {
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

function forPreset(config: unknown, presets: Presets): unknown {
  if (!isPlainObject(config) || validFor(presets.preset, config)) {
    return config;
  }
  return Object.fromEntries(
    Object.entries(config)
      .map(([key, value]) => [key, keptValue(presets, key, value)])
      .filter(([, value]) => value !== undefined),
  );
}

export function inheritedLayers(
  projectRoot: string,
  { inherits, memberPreset, repositoryRoot }: InheritOptions,
): InheritedLayers {
  if (inherits === undefined) {
    return { layers: [], preset: undefined };
  }
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
