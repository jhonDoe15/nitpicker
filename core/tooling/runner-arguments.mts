import { realpathSync } from 'node:fs';
import { fieldOf, isText, parseJson, textOf } from '../../shared/values/readers.mts';
import {
  parseJsonArray,
  parseJsonObject,
  type JsonObject,
} from './runner-options/json-options.mts';

type RunnerException = {
  readonly rule: string;
  readonly paths: string[];
  readonly function?: string;
};
type Choices = Readonly<Record<string, readonly string[]>>;
type OptionPair = readonly [string, string];

export type RunnerPolicy = {
  readonly crapLimit: number | undefined;
  readonly fileLimits: JsonObject | undefined;
  readonly testSeconds: JsonObject | undefined;
  readonly testConsoleAllow: unknown[] | undefined;
  readonly exclude: string[];
  readonly exceptions: RunnerException[];
  readonly legacyInventory: string | undefined;
  readonly policyRoot: string | undefined;
  readonly baselineRoot: string | undefined;
  readonly logRoot: string | undefined;
  readonly logLabel: string | undefined;
  readonly snapshot: string;
  readonly quick?: true;
  readonly preset: string | undefined;
  readonly kotlinFormatter: string | undefined;
  readonly buildTool: string | undefined;
  readonly analyzeGeneratedSources?: true;
  readonly mutationOff?: true;
  readonly kotlinDetektConfig: string | undefined;
  readonly duplicateSkippedFolders: string[] | undefined;
  readonly mutationScope: string[] | undefined;
  readonly toolPrecedence: Record<string, string[]> | undefined;
};

function isTextList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isText);
}

const PROJECT_ROOT_OPTION = '--project-root';
const CRAP_LIMIT_OPTION = '--crap-limit';
const EXCLUDE_OPTION = '--exclude';
const EXCEPTION_OPTION = '--exception';
const FILE_LIMITS_OPTION = '--file-limits';
const TEST_SECONDS_OPTION = '--test-seconds';
const TEST_CONSOLE_OPTION = '--test-console-allow';
export const MUTATION_SCOPE_OPTION = '--mutation-scope';

const SCOPE_USAGE = `${MUTATION_SCOPE_OPTION} must be a JSON array of project-relative paths`;

export function parseMutationScope(text: string | undefined): string[] {
  const paths = parseJson(textOf(text));
  if (!(
    isTextList(paths) &&
    paths.length > 0 &&
    paths.every((entry) => entry.length > 0 && entry !== '.')
  )) {
    throw new Error(SCOPE_USAGE);
  }
  return paths;
}

export function mutationScopeArguments(mutationScope: readonly string[] | undefined): string[] {
  return mutationScope === undefined ? [] : [MUTATION_SCOPE_OPTION, JSON.stringify(mutationScope)];
}

const BASE_USAGE =
  ' --project-root <directory> [--snapshot base|head] [--policy-root <directory>]' +
  ' [--baseline-root <directory>] [--log-root <directory> --log-label <path>]' +
  ' [--crap-limit <number>] [--exclude <glob>]... [--exception <json>]... [--legacy-inventory <path>]' +
  ' [--kotlin-detekt-config <path>] [--file-limits <json>] [--test-seconds <json>] [--test-console-allow <json array>] [--duplicate-skipped-folders <json array>]' +
  ` [${MUTATION_SCOPE_OPTION} <json array>]`;

function usageOf(runner: string, choices: Choices, precedenceTools: readonly string[]): string {
  const listed = Object.entries(choices).map(
    ([option, values]) => ` [${option} ${values.join('|')}]`,
  );
  const precedence = precedenceTools.length === 0 ? '' : ' [--<tool>-precedence <layers>]...';
  return `Usage: ${runner}${BASE_USAGE}${listed.join('')}${precedence}`;
}

function isException(entry: unknown): entry is RunnerException {
  const functionName = fieldOf(entry, 'function');
  return (
    typeof fieldOf(entry, 'rule') === 'string' &&
    isTextList(fieldOf(entry, 'paths')) &&
    (functionName === undefined || typeof functionName === 'string')
  );
}

function parseException(value: string, usage: string): RunnerException {
  let entry: unknown;
  try {
    entry = parseJson(value);
  } catch (error) {
    throw new Error(usage, { cause: error });
  }
  if (!isException(entry)) {
    throw new Error(usage);
  }
  return entry;
}

function parseSkippedFolders(value: string | undefined): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  const folders = parseJson(value);
  if (!isTextList(folders)) {
    throw new Error('--duplicate-skipped-folders must be a JSON array of folder names');
  }
  return folders;
}

function optionPairs(
  argumentList: readonly string[],
  usage: string,
  allowed: readonly string[],
): OptionPair[] {
  const pairs: OptionPair[] = [];
  const remaining = argumentList.values();
  for (const name of remaining) {
    const value = remaining.next().value;
    if (!allowed.includes(name) || value === undefined) {
      throw new Error(usage);
    }
    pairs.push([name, value]);
  }
  return pairs;
}

function valuesOf(pairs: readonly OptionPair[], option: string): string[] {
  return pairs.filter(([name]) => name === option).map(([, value]) => value);
}

function readOptionValues(
  argumentList: readonly string[],
  usage: string,
  allowed: readonly string[],
): { values: Map<string, string>; exclude: string[]; exceptions: RunnerException[] } {
  const pairs = optionPairs(argumentList, usage, allowed);
  const values = new Map(pairs.filter(([name]) => !REPEATED_OPTIONS.includes(name)));
  if (!values.has(PROJECT_ROOT_OPTION)) {
    throw new Error(usage);
  }
  return {
    values,
    exclude: valuesOf(pairs, EXCLUDE_OPTION),
    exceptions: valuesOf(pairs, EXCEPTION_OPTION).map((value) => parseException(value, usage)),
  };
}

function checkChoices(values: ReadonlyMap<string, string>, choices: Choices): void {
  for (const [option, allowed] of Object.entries(choices)) {
    const chosen = values.get(option);
    if (chosen !== undefined && !allowed.includes(chosen)) {
      throw new Error(`${option} must be one of: ${allowed.join(', ')}`);
    }
  }
}

export function parseRunnerArguments(
  argumentList: readonly string[],
  {
    runner = 'runner',
    choices = {},
    precedenceTools = [],
  }: {
    readonly runner?: string;
    readonly choices?: Choices;
    readonly precedenceTools?: readonly string[];
  } = {},
): { projectRoot: string | undefined; policy: RunnerPolicy } {
  const usage = usageOf(runner, choices, precedenceTools);
  const allowed = [...RUNNER_OPTIONS, ...precedenceTools.map(precedenceOption)];
  const { values, exclude, exceptions } = readOptionValues(argumentList, usage, allowed);
  checkChoices(values, choices);
  return {
    projectRoot: values.get(PROJECT_ROOT_OPTION),
    policy: {
      crapLimit: parseCrapLimit(values),
      fileLimits: parseJsonObject(values.get(FILE_LIMITS_OPTION), FILE_LIMITS_OPTION),
      testSeconds: parseJsonObject(values.get(TEST_SECONDS_OPTION), TEST_SECONDS_OPTION),
      testConsoleAllow: parseJsonArray(values.get(TEST_CONSOLE_OPTION), TEST_CONSOLE_OPTION),
      exclude,
      exceptions,
      legacyInventory: values.get('--legacy-inventory'),
      policyRoot: realpathOptional(values.get('--policy-root')),
      baselineRoot: realpathOptional(values.get('--baseline-root')),
      logRoot: values.get('--log-root'),
      logLabel: values.get('--log-label'),
      snapshot: values.get('--snapshot') ?? 'head',
      ...parseMode(values.get('--mode')),
      preset: values.get('--preset'),
      kotlinFormatter: values.get('--kotlin-formatter'),
      buildTool: values.get('--build-tool'),
      ...(values.get('--analyze-generated-sources') === 'true'
        ? { analyzeGeneratedSources: true }
        : {}),
      ...parseMutation(values.get('--mutation')),
      kotlinDetektConfig: values.get('--kotlin-detekt-config'),
      duplicateSkippedFolders: parseSkippedFolders(values.get('--duplicate-skipped-folders')),
      mutationScope: values.has(MUTATION_SCOPE_OPTION)
        ? parseMutationScope(values.get(MUTATION_SCOPE_OPTION))
        : undefined,
      toolPrecedence: toolPrecedence(values, precedenceTools),
    },
  };
}

function parseCrapLimit(values: ReadonlyMap<string, string>): number | undefined {
  const crapLimit = values.has(CRAP_LIMIT_OPTION)
    ? Number(values.get(CRAP_LIMIT_OPTION))
    : undefined;
  if (crapLimit !== undefined && !(Number.isFinite(crapLimit) && crapLimit > 0)) {
    throw new Error('--crap-limit must be a positive number');
  }
  return crapLimit;
}

function parseMutation(mutation: string | undefined): { mutationOff?: true } {
  if (mutation !== undefined && mutation !== 'off') {
    throw new Error('--mutation must be: off');
  }
  return mutation === 'off' ? { mutationOff: true } : {};
}

function parseMode(mode = 'full'): { quick?: true } {
  if (!['quick', 'full'].includes(mode)) {
    throw new Error('--mode must be one of: quick, full');
  }
  return mode === 'quick' ? { quick: true } : {};
}

function precedenceOption(tool: string): string {
  return `--${tool}-precedence`;
}

function toolPrecedence(
  values: ReadonlyMap<string, string>,
  precedenceTools: readonly string[],
): Record<string, string[]> | undefined {
  const chosen = precedenceTools.filter((tool) => values.has(precedenceOption(tool)));
  return chosen.length === 0
    ? undefined
    : Object.fromEntries(
        chosen.map((tool) => [tool, (values.get(precedenceOption(tool)) ?? '').split(',')]),
      );
}

const REPEATED_OPTIONS = [EXCLUDE_OPTION, EXCEPTION_OPTION];

const RUNNER_OPTIONS = [
  PROJECT_ROOT_OPTION,
  '--snapshot',
  '--policy-root',
  '--baseline-root',
  '--log-root',
  '--log-label',
  CRAP_LIMIT_OPTION,
  EXCLUDE_OPTION,
  EXCEPTION_OPTION,
  '--legacy-inventory',
  '--preset',
  '--kotlin-formatter',
  '--build-tool',
  '--analyze-generated-sources',
  '--mutation',
  '--kotlin-detekt-config',
  FILE_LIMITS_OPTION,
  TEST_SECONDS_OPTION,
  TEST_CONSOLE_OPTION,
  '--duplicate-skipped-folders',
  MUTATION_SCOPE_OPTION,
  '--mode',
];

function realpathOptional(directory: string | undefined): string | undefined {
  return directory === undefined ? undefined : realpathSync(directory);
}
