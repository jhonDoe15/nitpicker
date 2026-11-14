import path from 'node:path';
import { CONFIG_FILE_NAME, SCHEMA_KEY, configError } from '../../shared/config.mjs';
import { withCanonicalRules } from '../../shared/exceptions/validation.mjs';
import { listNames } from '../../shared/messages/messages.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { validateConfig, KEYS } from './validate.mjs';
import { rejectUnreadableSources } from './project-checks/project-config.mjs';
import { rejectUndeclaredPreset } from './project-checks/preset-detection.mjs';
import { rejectMissingBuildFiles } from './project-checks/project-markers.mjs';
import { rejectMissingConfiguredBuild } from '../../languages/java/builds/build-tool/build-tool-setting.mjs';

export function loadConfig(projectRoot) {
  const config = readConfigFile(projectRoot);
  rejectUnreadableSources(config, projectRoot);
  rejectUndeclaredPreset(config, projectRoot);
  rejectMissingBuildFiles(config, projectRoot);
  rejectMissingConfiguredBuild(config, projectRoot);
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
  return withoutSchemaKey(validateConfig(withCanonicalRules(parsed)));
}

function withoutSchemaKey(config) {
  return Object.fromEntries(Object.entries(config).filter(([key]) => key !== SCHEMA_KEY));
}

const RUN_SETTINGS = new Set(['analyzerTimeoutMinutes']);

export function describeConfigOverrides(config) {
  return KEYS.filter((key) => config[key] !== undefined && !RUN_SETTINGS.has(key)).flatMap((key) =>
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

function partsOf(analyzers) {
  return analyzers.flatMap(({ switchableParts = [] }) => switchableParts);
}

function isPartOnly(analyzers, name) {
  return partsOf(analyzers).includes(name) && !analyzers.some((analyzer) => analyzer.name === name);
}

function checkKnown(analyzers, disabled) {
  const names = new Set([...analyzers.map(({ name }) => name), ...partsOf(analyzers)]);
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
  const off = turnedOffByDependency(
    analyzers,
    disabled.filter((name) => !isPartOnly(analyzers, name)),
  );
  return analyzers.filter(({ name }) => !off.has(name));
}

function describeSwitchedOffParts(analyzers, disabled) {
  return analyzers
    .filter(({ switchableParts = [] }) => switchableParts.some((part) => disabled.includes(part)))
    .flatMap(({ name, switchableParts }) =>
      switchableParts
        .filter((part) => disabled.includes(part))
        .map(
          (part) =>
            `${part} is turned off by "disable", so ${name} does not run it on the base or the head`,
        ),
    );
}

export function describeDisableCascade(analyzers, config) {
  const disabled = config.disable ?? [];
  const causes = turnedOffByDependency(analyzers, disabled);
  return [
    ...describeSwitchedOffParts(analyzers, disabled),
    ...disabled.flatMap((root) => {
      const dependents = analyzers
        .map(({ name }) => name)
        .filter((name) => !disabled.includes(name) && causes.get(name) === root);
      return dependents.length === 0
        ? []
        : [
            `${root} is disabled, so ${listNames(dependents)} ${dependents.length > 1 ? 'are' : 'is'} off too`,
          ];
    }),
  ];
}
