import { existsSync } from 'node:fs';
import path from 'node:path';
import { CONFIG_FILE_NAME, configError, isPlainObject } from '../../../shared/config.mjs';
import { withCanonicalRules } from '../../../shared/exceptions/validation.mjs';
import { SUPPORTED_PRESETS, validateConfig, validateKeys } from '../validate.mjs';
import { readLayers } from './layers.mjs';
import { mergeLayers, settingsOf } from './merge.mjs';
import { validateProjects } from './settings.mjs';

function relabel(error, label) {
  return new Error(error.message.replace(`${CONFIG_FILE_NAME}: `, `${label}: `), { cause: error });
}

function checkLayer(layer) {
  if (!isPlainObject(layer.config)) {
    throw configError(`${layer.label}: must be a JSON object`);
  }
  try {
    validateKeys(layer.config);
    if (layer.config.projects !== undefined) {
      validateProjects(layer.config.projects, SUPPORTED_PRESETS);
    }
  } catch (error) {
    throw relabel(error, layer.label);
  }
}

function withOverlay(merged, overlay) {
  if (overlay?.preset === undefined || merged.preset === overlay.preset) {
    return merged;
  }
  if (merged.preset === undefined) {
    return { ...merged, preset: overlay.preset };
  }
  if (overlay.declared) {
    throw configError(
      `"projects" lists this project with "preset": "${overlay.preset}", ` +
        `but its config sets "preset": "${merged.preset}". Make them agree`,
    );
  }
  return merged;
}

function failureOf(layer, merged) {
  try {
    validateConfig({ ...layer.settings, preset: layer.settings.preset ?? merged.preset });
    return undefined;
  } catch (error) {
    return error;
  }
}

function culprit(layers, merged) {
  return layers.find((layer) => failureOf(layer, merged) !== undefined);
}

function validateMerged(merged, layers) {
  try {
    return validateConfig(merged);
  } catch (error) {
    const source = layers.length > 1 ? culprit(layers, merged) : undefined;
    throw source === undefined ? error : relabel(error, source.label);
  }
}

export function readLayeredConfig(projectRoot, { overlay, repositoryRoot } = {}) {
  const configPath = path.join(projectRoot, CONFIG_FILE_NAME);
  const layers = (existsSync(configPath) ? readLayers(configPath, { repositoryRoot }) : []).map(
    (layer) => ({ ...layer, config: withCanonicalRules(layer.config) }),
  );
  for (const layer of layers) {
    checkLayer(layer);
  }
  const withSettings = layers.map((layer) => ({ ...layer, settings: settingsOf(layer.config) }));
  const merged = mergeLayers(withSettings.map(({ settings }) => settings));
  return validateMerged(withOverlay(merged, overlay), withSettings);
}
