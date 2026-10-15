import path from 'node:path';
import { CONFIG_FILE_NAME, configError } from '../../shared/config.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { validateConfig, KEYS } from './validate.mjs';
import { rejectUnreadableSources } from './project-checks/project-config.mjs';
import { rejectUndeclaredPreset } from './project-checks/preset-detection.mjs';

export function loadConfig(projectRoot) {
  const config = readConfigFile(projectRoot);
  rejectUnreadableSources(config, projectRoot);
  rejectUndeclaredPreset(config, projectRoot);
  return config;
}

export function readConfigFile(projectRoot) {
  const configPath = path.join(projectRoot, CONFIG_FILE_NAME);
  if (!existsSync(configPath)) {
    return {};
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (error) {
    throw new Error(
      `${CONFIG_FILE_NAME} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  return validateConfig(parsed);
}

export function describeConfigOverrides(config) {
  return KEYS.filter((key) => config[key] !== undefined).flatMap((key) =>
    key === 'python' ? describePythonOverrides(config.python) : describeOverride(config, key),
  );
}

function describeOverride(config, key) {
  return key === 'exceptions'
    ? config.exceptions.map(describeException)
    : [`${key}: ${JSON.stringify(config[key])}`];
}

function describeException(entry) {
  return `exception: ${JSON.stringify(entry)}`;
}

function describePythonOverrides({ exceptions = [], ...settings }) {
  return [
    ...(Object.keys(settings).length === 0 ? [] : [`python: ${JSON.stringify(settings)}`]),
    ...exceptions.map(describeException),
  ];
}

export function applyDisable(analyzers, config) {
  const disabled = config.disable ?? [];
  if (disabled.length === 0) {
    return analyzers;
  }
  const names = new Set(analyzers.map(({ name }) => name));
  const unknown = disabled.filter((name) => !names.has(name));
  if (unknown.length > 0) {
    throw configError(
      `"disable" names unknown analyzers: ${unknown.join(', ')}. Known analyzers: ${[...names].sort().join(', ')}`,
    );
  }
  const remaining = analyzers.filter(({ name }) => !disabled.includes(name));
  for (const analyzer of remaining) {
    const blocked = (analyzer.dependencies ?? []).filter((name) => disabled.includes(name));
    if (blocked.length > 0) {
      throw configError(
        `"disable" cannot disable ${blocked.join(', ')} because ${analyzer.name} depends on it`,
      );
    }
  }
  return remaining;
}
