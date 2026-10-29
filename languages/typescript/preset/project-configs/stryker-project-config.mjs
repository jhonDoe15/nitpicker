import { isPlainObject, isStringList } from '../../../../shared/config.mjs';
import { isRegularFile, resolveInside } from '../../../../shared/conventions/read-inside.mjs';
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
const TIMEOUT_FLOORS = { timeoutMS: 5000, timeoutFactor: 1.5, dryRunTimeoutMinutes: 5 };
const STATIC_IGNORED = 'Static mutant (and "ignoreStatic" was enabled)';

export function mutationDisabled(config) {
  return (config.disable ?? []).includes('mutation');
}

export function strykerProjectFile(projectRoot) {
  return STRYKER_PROJECT_FILES.find((name) => {
    const file = resolveInside(projectRoot, name);
    return file !== undefined && isRegularFile(file);
  });
}

function malformedKey(config) {
  if (config.mutator !== undefined && !isPlainObject(config.mutator)) {
    return ['mutator', 'an object'];
  }
  const lists = [
    ...LIST_KEYS.map((key) => [key, config[key]]),
    ['mutator.excludedMutations', config.mutator?.excludedMutations],
  ];
  const list = lists.find(([, value]) => value !== undefined && !isStringList(value));
  const timeout = Object.keys(TIMEOUT_FLOORS).find(
    (key) => config[key] !== undefined && !(Number.isFinite(config[key]) && config[key] >= 0),
  );
  if (list !== undefined) {
    return [list[0], 'an array of strings'];
  }
  return timeout === undefined ? undefined : [timeout, 'a number of 0 or more'];
}

function checkedTypes(config, name) {
  const malformed = malformedKey(config);
  if (malformed !== undefined) {
    throw new Error(`${name}: "${malformed[0]}" must be ${malformed[1]}`);
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

export function appliedStrykerConfig(projectRoot) {
  const file = strykerProjectFile(projectRoot);
  if (file === undefined) {
    return { values: {} };
  }
  const { mutator = {}, ...values } = readStrykerProjectConfig(projectRoot);
  return {
    file,
    values: {
      ...values,
      ...Object.fromEntries(
        Object.entries(mutator).map(([key, value]) => [`mutator.${key}`, value]),
      ),
    },
  };
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

function flooredTimeouts(config, ranked) {
  return Object.fromEntries(
    Object.entries(TIMEOUT_FLOORS)
      .filter(([key]) => ranked[key] !== undefined)
      .map(([key, floor]) => [key, Math.max(ranked[key], config[key] ?? floor)]),
  );
}

export function layeredStrykerConfig(config, settings = readHeadPolicyFile().tools?.stryker) {
  const project = projectStrykerConfig(settings);
  if (project === undefined) {
    return config;
  }
  const { nitpickerFirst } = precedenceLayers(settings.precedence);
  const ranked = pickedKeys(
    project,
    RANKED_KEYS.filter((key) => !nitpickerFirst || config[key] === undefined),
  );
  return {
    ...config,
    ...ranked,
    ...flooredTimeouts(config, ranked),
    ...Object.fromEntries(
      ADDED_KEYS.filter((key) => project[key] !== undefined).map((key) => [
        key,
        [...(config[key] ?? []), ...project[key]],
      ]),
    ),
    ignorePatterns: [...(project[IGNORE_PATTERNS] ?? []), ...(config[IGNORE_PATTERNS] ?? [])],
  };
}

function ignoredByProject(config) {
  const reasons = new Set(
    (config.mutator?.excludedMutations ?? []).map(
      (name) => `Ignored because of excluded mutation "${name}"`,
    ),
  );
  if (config.ignoreStatic === true) {
    reasons.add(STATIC_IGNORED);
  }
  return (mutant) => mutant.status === 'Ignored' && reasons.has(mutant.statusReason);
}

export function withoutProjectIgnoredMutants(report, appliedConfig) {
  const ignored = ignoredByProject(appliedConfig);
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
