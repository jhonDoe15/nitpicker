import { existsSync } from 'node:fs';
import path from 'node:path';
import { CONFIG_FILE_NAME, SCHEMA_KEY, configError } from '../../../shared/config.mjs';
import { withCanonicalRules as untypedCanonicalRules } from '../../../shared/exceptions/validation.mjs';
import { withKotlinRuleAliases as untypedKotlinAliases } from '../../../languages/java/adapters/kotlin/kotlin-options.mts';
import type {
  ConfigLayer,
  ConfigSettings,
  NitpickerConfig,
  ProjectOverlay,
} from '../../../shared/values/config-types.mts';
import { isPlainObject, messageOf, textOf, textsOf } from '../../../shared/values/readers.mts';
import { SUPPORTED_PRESETS, validateConfig, validateKeys } from '../validate.mts';
import { inheritedLayers } from './inherited.mts';
import { readLayers as untypedReadLayers } from './layers.mjs';
import { mergeLayers as untypedMergeLayers, settingsOf as untypedSettingsOf } from './merge.mjs';
import { validateProjects as untypedValidateProjects } from './settings.mjs';

const withCanonicalRules: (config: unknown) => unknown = untypedCanonicalRules;
const withKotlinRuleAliases: (config: unknown) => unknown = untypedKotlinAliases;
const readLayers: (
  configPath: string,
  options?: { readonly repositoryRoot?: string | undefined },
) => readonly ConfigLayer[] = untypedReadLayers;
const mergeLayers: (configs: readonly ConfigSettings[]) => ConfigSettings = untypedMergeLayers;
const settingsOf: (config: unknown) => ConfigSettings = untypedSettingsOf;
const validateProjects: (projects: unknown, presets: readonly string[]) => void =
  untypedValidateProjects;

type LabeledLayer = { readonly label: string; readonly config: unknown };
type CheckedLayer = LabeledLayer & { readonly settings: ConfigSettings };

export type LayeredOptions = {
  readonly overlay?: ProjectOverlay | undefined;
  readonly repositoryRoot?: string | undefined;
};

function relabel(error: unknown, label: string): Error {
  return new Error(messageOf(error).replace(`${CONFIG_FILE_NAME}: `, `${label}: `), {
    cause: error,
  });
}

function checkLayer(layer: LabeledLayer): void {
  if (!isPlainObject(layer.config)) {
    throw new Error(`${layer.label}: must be a JSON object`);
  }
  try {
    validateKeys(layer.config);
    if (layer.config['projects'] !== undefined) {
      validateProjects(layer.config['projects'], SUPPORTED_PRESETS);
    }
  } catch (error) {
    throw relabel(error, layer.label);
  }
}

function withExcludes(merged: ConfigSettings, overlay: ProjectOverlay | undefined): ConfigSettings {
  if (overlay?.exclude === undefined) {
    return merged;
  }
  return { ...merged, exclude: [...new Set([...textsOf(merged['exclude']), ...overlay.exclude])] };
}

function withOverlay(merged: ConfigSettings, overlay: ProjectOverlay | undefined): ConfigSettings {
  if (overlay?.preset === undefined || merged['preset'] === overlay.preset) {
    return merged;
  }
  if (merged['preset'] === undefined) {
    return { ...merged, preset: overlay.preset };
  }
  if (overlay.declared) {
    throw configError(
      `"projects" lists this project with "preset": "${overlay.preset}", ` +
        `but its config sets "preset": "${textOf(merged['preset'])}". Make them agree`,
    );
  }
  return merged;
}

function failureOf(layer: CheckedLayer, merged: ConfigSettings): unknown {
  try {
    validateConfig({ ...layer.settings, preset: layer.settings['preset'] ?? merged['preset'] });
    return undefined;
  } catch (error) {
    return error;
  }
}

function culprit(
  layers: readonly CheckedLayer[],
  merged: ConfigSettings,
): CheckedLayer | undefined {
  return layers.find((layer) => failureOf(layer, merged) !== undefined);
}

function withoutSchemaKey(config: NitpickerConfig): NitpickerConfig {
  return Object.fromEntries(Object.entries(config).filter(([key]) => key !== SCHEMA_KEY));
}

function validateMerged(merged: ConfigSettings, layers: readonly CheckedLayer[]): NitpickerConfig {
  try {
    return withoutSchemaKey(validateConfig(merged));
  } catch (error) {
    const source = layers.length > 0 ? culprit(layers, merged) : undefined;
    throw source === undefined ? error : relabel(error, source.label);
  }
}

function ownLayers(
  projectRoot: string,
  repositoryRoot: string | undefined,
): readonly ConfigLayer[] {
  const configPath = path.join(projectRoot, CONFIG_FILE_NAME);
  return existsSync(configPath) ? readLayers(configPath, { repositoryRoot }) : [];
}

function checkedLayers(layers: readonly LabeledLayer[]): readonly CheckedLayer[] {
  const canonical = layers.map((layer) => ({
    ...layer,
    config: withCanonicalRules(withKotlinRuleAliases(layer.config)),
  }));
  for (const layer of canonical) {
    checkLayer(layer);
  }
  return canonical.map((layer) => ({ ...layer, settings: settingsOf(layer.config) }));
}

function withInheritedPreset(merged: ConfigSettings, preset: string | undefined): ConfigSettings {
  return merged['preset'] === undefined && preset !== undefined ? { ...merged, preset } : merged;
}

const ENTRY_SETTINGS_LABEL = '"settings" of the "projects" entry';
const ENTRY_ONLY_KEYS = ['projects', 'extends', 'preset'];

function companionLayers(
  own: readonly CheckedLayer[],
  overlay: ProjectOverlay | undefined,
): readonly CheckedLayer[] {
  if (overlay?.companion !== true) {
    return own;
  }
  const { preset } = mergeLayers(own.map(({ settings }) => settings));
  return preset === undefined || preset === overlay.preset ? own : [];
}

function entryLayers(overlay: ProjectOverlay | undefined): readonly CheckedLayer[] {
  const settings = overlay?.settings;
  if (settings === undefined) {
    return [];
  }
  const misplaced = ENTRY_ONLY_KEYS.filter((key) => Object.hasOwn(settings, key));
  if (misplaced.length > 0) {
    throw configError(
      `${ENTRY_SETTINGS_LABEL} cannot set ${misplaced.map((key) => `"${key}"`).join(', ')}`,
    );
  }
  return checkedLayers([{ label: ENTRY_SETTINGS_LABEL, config: settings }]);
}

export function readLayeredConfig(
  projectRoot: string,
  { overlay, repositoryRoot }: LayeredOptions = {},
): NitpickerConfig {
  const own = [
    ...companionLayers(checkedLayers(ownLayers(projectRoot, repositoryRoot)), overlay),
    ...entryLayers(overlay),
  ];
  const ownMerged = withOverlay(mergeLayers(own.map(({ settings }) => settings)), overlay);
  const inherited = inheritedLayers(projectRoot, {
    inherits: overlay?.inherits,
    memberPreset: typeof ownMerged['preset'] === 'string' ? ownMerged['preset'] : undefined,
    repositoryRoot,
  });
  const layers = [...checkedLayers(inherited.layers), ...own];
  const merged = withOverlay(mergeLayers(layers.map(({ settings }) => settings)), overlay);
  return validateMerged(
    withExcludes(withInheritedPreset(merged, inherited.preset), overlay),
    layers,
  );
}
