import {
  fieldOf,
  isPlainObject,
  listOf,
  messageOf,
  numberOr,
  textsOf,
} from '../../../../shared/values/readers.mts';
import {
  firstProjectFile,
  isStringList,
  missingProjectConfig,
  picked,
  precedenceLayers,
} from '../project-tools/typed/shared-views.mts';
import type { ToolSettings } from '../project-tools/typed/tool-types.mts';
import { readConfigObject } from './config-module.mts';
import type { StrykerConfig, StrykerMutant } from './project-config-types.mts';

export const STRYKER_TOOL = 'stryker';

const STRYKER_PROJECT_FILES = ['', '.'].flatMap((prefix) =>
  ['.conf', '.config'].flatMap((suffix) =>
    ['json', 'js', 'mjs', 'cjs'].map((extension) => `${prefix}stryker${suffix}.${extension}`),
  ),
);

const MUTATOR = 'mutator';
const RANKED_KEYS = [
  MUTATOR,
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

export function mutationDisabled(config: {
  readonly disable?: readonly string[] | undefined;
}): boolean {
  return (config.disable ?? []).includes('mutation');
}

export function strykerProjectFile(projectRoot: string): string | undefined {
  return firstProjectFile(projectRoot, STRYKER_PROJECT_FILES);
}

function malformedKey(config: StrykerConfig): [string, string] | undefined {
  const mutator = fieldOf(config, MUTATOR);
  if (mutator !== undefined && !isPlainObject(mutator)) {
    return [MUTATOR, 'an object'];
  }
  const lists: [string, unknown][] = [
    ...LIST_KEYS.map((key): [string, unknown] => [key, fieldOf(config, key)]),
    ['mutator.excludedMutations', fieldOf(mutator, 'excludedMutations')],
  ];
  const list = lists.find(([, value]) => value !== undefined && !isStringList(value));
  const timeout = Object.keys(TIMEOUT_FLOORS).find((key) => {
    const value = fieldOf(config, key);
    return (
      value !== undefined && !(typeof value === 'number' && Number.isFinite(value) && value >= 0)
    );
  });
  if (list !== undefined) {
    return [list[0], 'an array of strings'];
  }
  return timeout === undefined ? undefined : [timeout, 'a number of 0 or more'];
}

function checkedTypes(config: StrykerConfig, name: string): StrykerConfig {
  const malformed = malformedKey(config);
  if (malformed !== undefined) {
    throw new Error(`${name}: "${malformed[0]}" must be ${malformed[1]}`);
  }
  return config;
}

export function readStrykerProjectConfig(projectRoot: string): StrykerConfig {
  const name = strykerProjectFile(projectRoot);
  if (name === undefined) {
    throw new Error(
      missingProjectConfig(STRYKER_TOOL, `a Stryker config (${STRYKER_PROJECT_FILES.join(', ')})`),
    );
  }
  return checkedTypes(
    picked(readConfigObject(projectRoot, name), [...RANKED_KEYS, ...LIST_KEYS]),
    name,
  );
}

function projectStrykerConfig(settings: ToolSettings | undefined): StrykerConfig | undefined {
  if (settings === undefined || !precedenceLayers(settings.precedence).usesProject) {
    return undefined;
  }
  const failure = fieldOf(settings, 'projectConfigError');
  if (failure !== undefined) {
    throw new Error(messageOf(failure));
  }
  const projectConfig = fieldOf(settings, 'projectConfig');
  if (!isPlainObject(projectConfig)) {
    throw new Error('The head policy is missing the Stryker project config');
  }
  return projectConfig;
}

function flooredTimeouts(config: StrykerConfig, ranked: StrykerConfig): Record<string, number> {
  return Object.fromEntries(
    Object.entries(TIMEOUT_FLOORS)
      .filter(([key]) => fieldOf(ranked, key) !== undefined)
      .map(([key, floor]) => [
        key,
        Math.max(numberOr(fieldOf(ranked, key), floor), numberOr(fieldOf(config, key), floor)),
      ]),
  );
}

export function layeredStrykerConfig(
  config: StrykerConfig,
  settings: ToolSettings | undefined,
): StrykerConfig {
  const project = projectStrykerConfig(settings);
  if (project === undefined) {
    return config;
  }
  const { nitpickerFirst } = precedenceLayers(settings?.precedence);
  const ranked = picked(
    project,
    RANKED_KEYS.filter((key) => !nitpickerFirst || fieldOf(config, key) === undefined),
  );
  return {
    ...config,
    ...ranked,
    ...flooredTimeouts(config, ranked),
    ...Object.fromEntries(
      ADDED_KEYS.filter((key) => fieldOf(project, key) !== undefined).map((key) => [
        key,
        [...listOf(fieldOf(config, key)), ...listOf(fieldOf(project, key))],
      ]),
    ),
    ignorePatterns: [
      ...listOf(fieldOf(project, IGNORE_PATTERNS)),
      ...listOf(fieldOf(config, IGNORE_PATTERNS)),
    ],
  };
}

function ignoredByProject(config: StrykerConfig): (mutant: StrykerMutant) => boolean {
  const reasons = new Set(
    textsOf(fieldOf(fieldOf(config, MUTATOR), 'excludedMutations')).map(
      (name) => `Ignored because of excluded mutation "${name}"`,
    ),
  );
  if (fieldOf(config, 'ignoreStatic') === true) {
    reasons.add(STATIC_IGNORED);
  }
  return (mutant) =>
    mutant.status === 'Ignored' &&
    mutant.statusReason !== undefined &&
    reasons.has(mutant.statusReason);
}

export function withoutProjectIgnoredMutants<Mutant extends StrykerMutant>(
  report: { readonly files?: Readonly<Record<string, { readonly mutants?: readonly Mutant[] }>> },
  appliedConfig: StrykerConfig,
): { files: Record<string, { mutants: Mutant[] }> } {
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
