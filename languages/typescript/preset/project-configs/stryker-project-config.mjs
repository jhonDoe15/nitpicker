import { existsSync } from 'node:fs';
import { isPlainObject, isStringList } from '../../../../shared/config.mjs';
import { resolveInside } from '../../../../shared/conventions/read-inside.mjs';
import {
  missingProjectConfig,
  precedenceLayers,
} from '../../../../shared/conventions/tool-precedence.mjs';
import { readHeadPolicyFile } from '../../../../shared/head-policy.mjs';
import { pickedKeys, readConfigObject } from './config-module.mjs';

export const STRYKER_TOOL = 'stryker';

export const STRYKER_PROJECT_FILES = ['', '.'].flatMap((prefix) =>
  ['.conf', '.config'].flatMap((suffix) =>
    ['json', 'js', 'mjs', 'cjs'].map((extension) => `${prefix}stryker${suffix}.${extension}`),
  ),
);

const RANKED_KEYS = [
  'mutator',
  'ignoreStatic',
  'timeoutMS',
  'timeoutFactor',
  'dryRunTimeoutMinutes',
  'concurrency',
  'maxTestRunnerReuse',
  'disableBail',
  'warnings',
];
const ADDED_KEYS = ['testRunnerNodeArgs', 'checkerNodeArgs'];
const IGNORE_PATTERNS = 'ignorePatterns';
const LIST_KEYS = [...ADDED_KEYS, IGNORE_PATTERNS];
const STATIC_IGNORED = 'Static mutant (and "ignoreStatic" was enabled)';

export function strykerProjectFile(projectRoot) {
  return STRYKER_PROJECT_FILES.find((name) => {
    const file = resolveInside(projectRoot, name);
    return file !== undefined && existsSync(file);
  });
}

function checkedTypes(config, name) {
  const lists = [
    ...LIST_KEYS.filter((key) => config[key] !== undefined).map((key) => [key, config[key]]),
    ...(config.mutator?.excludedMutations === undefined
      ? []
      : [['mutator.excludedMutations', config.mutator.excludedMutations]]),
  ];
  const malformed = lists.find(([, value]) => !isStringList(value));
  if (malformed !== undefined) {
    throw new Error(`${name}: "${malformed[0]}" must be an array of strings`);
  }
  if (config.mutator !== undefined && !isPlainObject(config.mutator)) {
    throw new Error(`${name}: "mutator" must be an object`);
  }
  return config;
}

export function readStrykerProjectConfig(projectRoot) {
  const name = strykerProjectFile(projectRoot);
  if (name === undefined) {
    throw new Error(
      missingProjectConfig(STRYKER_TOOL, `a Stryker config (${STRYKER_PROJECT_FILES.join(', ')})`),
    );
  }
  return checkedTypes(
    pickedKeys(readConfigObject(projectRoot, name), [...RANKED_KEYS, ...LIST_KEYS]),
    name,
  );
}

function projectStrykerConfig(settings) {
  if (!precedenceLayers(settings?.precedence).usesProject) {
    return undefined;
  }
  if (settings.projectConfigError !== undefined) {
    throw new Error(settings.projectConfigError);
  }
  if (!isPlainObject(settings.projectConfig)) {
    throw new Error('The head policy is missing the Stryker project config');
  }
  return settings.projectConfig;
}

export function layeredStrykerConfig(config, settings = readHeadPolicyFile().tools?.stryker) {
  const project = projectStrykerConfig(settings);
  if (project === undefined) {
    return config;
  }
  const { nitpickerFirst } = precedenceLayers(settings.precedence);
  const ranked = RANKED_KEYS.filter((key) => !nitpickerFirst || config[key] === undefined);
  return {
    ...config,
    ...pickedKeys(project, ranked),
    ...Object.fromEntries(
      ADDED_KEYS.filter((key) => project[key] !== undefined).map((key) => [
        key,
        [...(config[key] ?? []), ...project[key]],
      ]),
    ),
    ignorePatterns: [...(project[IGNORE_PATTERNS] ?? []), ...(config[IGNORE_PATTERNS] ?? [])],
  };
}

function ignoredByProject(project) {
  const excluded = new Set(project.mutator?.excludedMutations ?? []);
  return (mutant) =>
    mutant.status === 'Ignored' &&
    (excluded.has(mutant.mutatorName) ||
      (project.ignoreStatic === true &&
        mutant.static === true &&
        mutant.statusReason === STATIC_IGNORED));
}

export function withoutProjectIgnoredMutants(
  report,
  settings = readHeadPolicyFile().tools?.stryker,
) {
  const project = projectStrykerConfig(settings);
  if (project === undefined) {
    return report;
  }
  const ignored = ignoredByProject(project);
  return {
    ...report,
    files: Object.fromEntries(
      Object.entries(report.files ?? {}).map(([file, entry]) => [
        file,
        { ...entry, mutants: (entry.mutants ?? []).filter((mutant) => !ignored(mutant)) },
      ]),
    ),
  };
}
