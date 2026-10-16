import path from 'node:path';
import { CONFIG_FILE_NAME, configError } from '../../shared/config.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { validateConfig, KEYS } from './validate.mjs';

export function loadConfig(projectRoot) {
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

function dependentsOf(name, analyzers) {
  return analyzers
    .filter((analyzer) => (analyzer.dependencies ?? []).includes(name))
    .map((analyzer) => analyzer.name)
    .toSorted();
}

function blockMessage(name, dependents) {
  const [verb, pronoun] = dependents.length > 1 ? ['depend', 'them'] : ['depends', 'it'];
  const names = dependents.join(' and ');
  return `cannot disable ${name} because ${names} ${verb} on it; add ${pronoun} to "disable" too`;
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
  const blockers = disabled.filter((name) => dependentsOf(name, remaining).length > 0);
  if (blockers.length > 0) {
    throw configError(
      `"disable" ${blockers.map((name) => blockMessage(name, dependentsOf(name, remaining))).join('; ')}`,
    );
  }
  return remaining;
}
