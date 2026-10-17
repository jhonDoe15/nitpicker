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
    .map((analyzer) => analyzer.name);
}

function turnedOffByDependency(analyzers, disabled) {
  const causes = new Map(disabled.map((name) => [name, name]));
  for (const name of causes.keys()) {
    for (const dependent of dependentsOf(name, analyzers)) {
      causes.set(dependent, causes.get(dependent) ?? causes.get(name));
    }
  }
  return causes;
}

function listNames(names) {
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
}

function checkKnown(analyzers, disabled) {
  const names = new Set(analyzers.map(({ name }) => name));
  const unknown = disabled.filter((name) => !names.has(name));
  if (unknown.length > 0) {
    throw configError(
      `"disable" names unknown analyzers: ${unknown.join(', ')}. Known analyzers: ${[...names].sort().join(', ')}`,
    );
  }
}

export function applyDisable(analyzers, config) {
  const disabled = config.disable ?? [];
  if (disabled.length === 0) {
    return analyzers;
  }
  checkKnown(analyzers, disabled);
  const off = turnedOffByDependency(analyzers, disabled);
  return analyzers.filter(({ name }) => !off.has(name));
}

export function describeDisableCascade(analyzers, config) {
  const disabled = config.disable ?? [];
  const causes = turnedOffByDependency(analyzers, disabled);
  return disabled.flatMap((root) => {
    const dependents = analyzers
      .map(({ name }) => name)
      .filter((name) => !disabled.includes(name) && causes.get(name) === root);
    return dependents.length === 0
      ? []
      : [
          `${root} is disabled, so ${listNames(dependents)} ${dependents.length > 1 ? 'are' : 'is'} off too`,
        ];
  });
}
