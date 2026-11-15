import path from 'node:path';
import { CONFIG_FILE_NAME, SCHEMA_KEY, configError } from '../../shared/config.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { validateConfig, KEYS } from './validate.mts';
import {
  rejectMissingBuildFiles,
  rejectUndeclaredPreset,
  rejectUnreadableSources,
} from './project-checks/project-check-views.mts';
import {
  listNames,
  rejectMissingConfiguredBuild,
  withCanonicalRules,
  withKotlinRuleAliases,
} from './views/config-views.mts';
import { textsOf } from '../../shared/values/readers.mts';
import type { NitpickerConfig } from '../../shared/values/config-types.mts';

export function loadConfig(projectRoot: string): NitpickerConfig {
  const config = readConfigFile(projectRoot);
  rejectUnreadableSources(config, projectRoot);
  rejectUndeclaredPreset(config, projectRoot);
  rejectMissingBuildFiles(config, projectRoot);
  rejectMissingConfiguredBuild(config, projectRoot);
  return config;
}

export function readConfigFile(projectRoot: string): NitpickerConfig {
  const configPath = path.join(projectRoot, CONFIG_FILE_NAME);
  if (!existsSync(configPath)) {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (error) {
    throw new Error(
      `${CONFIG_FILE_NAME} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  return withoutSchemaKey(validateConfig(withCanonicalRules(withKotlinRuleAliases(parsed))));
}

function withoutSchemaKey(config: NitpickerConfig): NitpickerConfig {
  return Object.fromEntries(Object.entries(config).filter(([key]) => key !== SCHEMA_KEY));
}

type ConfigurableAnalyzer = {
  readonly name: string;
  readonly dependencies?: unknown;
  readonly switchableParts?: unknown;
};

type PythonConfig = { readonly exceptions?: readonly unknown[]; readonly [field: string]: unknown };

const RUN_SETTINGS = new Set(['analyzerTimeoutMinutes']);

export function describeConfigOverrides(config: NitpickerConfig): string[] {
  return KEYS.filter((key) => config[key] !== undefined && !RUN_SETTINGS.has(key)).flatMap((key) =>
    key === 'python' && config.python !== undefined
      ? describePythonOverrides(config.python)
      : describeOverride(config, key),
  );
}

function describeOverride(config: NitpickerConfig, key: string): string[] {
  return key === 'exceptions'
    ? (config.exceptions ?? []).map(describeException)
    : [`${key}: ${JSON.stringify(config[key])}`];
}

function describeException(entry: unknown): string {
  return `exception: ${JSON.stringify(entry)}`;
}

function describePythonOverrides({ exceptions = [], ...settings }: PythonConfig): string[] {
  return [
    ...(Object.keys(settings).length === 0 ? [] : [`python: ${JSON.stringify(settings)}`]),
    ...exceptions.map(describeException),
  ];
}

function dependentsOf(name: string, analyzers: readonly ConfigurableAnalyzer[]): string[] {
  return analyzers
    .filter((analyzer) => textsOf(analyzer.dependencies).includes(name))
    .map((analyzer) => analyzer.name);
}

function turnedOffByDependency(
  analyzers: readonly ConfigurableAnalyzer[],
  disabled: readonly string[],
): Map<string, string> {
  const causes = new Map<string, string>(disabled.map((name) => [name, name]));
  for (const name of causes.keys()) {
    for (const dependent of dependentsOf(name, analyzers)) {
      causes.set(dependent, causes.get(dependent) ?? causes.get(name) ?? name);
    }
  }
  return causes;
}

function partsOf(analyzers: readonly ConfigurableAnalyzer[]): string[] {
  return analyzers.flatMap(({ switchableParts }) => textsOf(switchableParts));
}

function isPartOnly(analyzers: readonly ConfigurableAnalyzer[], name: string): boolean {
  return partsOf(analyzers).includes(name) && !analyzers.some((analyzer) => analyzer.name === name);
}

function checkKnown(analyzers: readonly ConfigurableAnalyzer[], disabled: readonly string[]): void {
  const names = new Set([...analyzers.map(({ name }) => name), ...partsOf(analyzers)]);
  const unknown = disabled.filter((name) => !names.has(name));
  if (unknown.length > 0) {
    throw configError(
      `"disable" names unknown analyzers: ${unknown.join(', ')}. Known analyzers: ${[...names].sort().join(', ')}`,
    );
  }
}

export function applyDisable<T extends ConfigurableAnalyzer>(
  analyzers: readonly T[],
  config: NitpickerConfig,
): readonly T[] {
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

function describeSwitchedOffParts(
  analyzers: readonly ConfigurableAnalyzer[],
  disabled: readonly string[],
): string[] {
  return analyzers
    .filter(({ switchableParts }) =>
      textsOf(switchableParts).some((part) => disabled.includes(part)),
    )
    .flatMap(({ name, switchableParts }) =>
      textsOf(switchableParts)
        .filter((part) => disabled.includes(part))
        .map(
          (part) =>
            `${part} is turned off by "disable", so ${name} does not run it on the base or the head`,
        ),
    );
}

export function describeDisableCascade(
  analyzers: readonly ConfigurableAnalyzer[],
  config: NitpickerConfig,
): string[] {
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
