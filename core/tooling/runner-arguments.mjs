import { realpathSync } from 'node:fs';

export const EXCEPTION_SEPARATOR = ':';

const BASE_USAGE =
  ' --project-root <directory> [--snapshot base|head] [--policy-root <directory>]' +
  ' [--baseline-root <directory>] [--crap-limit <number>] [--exclude <glob>]... [--exception <rule>:<glob>]... [--legacy-inventory <path>]' +
  ' [--kotlin-detekt-config <path>] [--file-limits <json>] [--test-seconds <json>] [--duplicate-skipped-folders <json array>]';

function usageOf(runner, choices, precedenceTools) {
  const listed = Object.entries(choices).map(
    ([option, values]) => ` [${option} ${values.join('|')}]`,
  );
  const precedence = precedenceTools.map((tool) => ` [--${tool}-precedence <layers>]`);
  return `Usage: ${runner}${BASE_USAGE}${listed.join('')}${precedence.join('')}`;
}

function parseException(value, usage) {
  const separator = value.indexOf(EXCEPTION_SEPARATOR);
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error(usage);
  }
  return { rule: value.slice(0, separator), glob: value.slice(separator + 1) };
}

function parseSkippedFolders(value) {
  if (value === undefined) {
    return undefined;
  }
  const folders = JSON.parse(value);
  if (!Array.isArray(folders) || !folders.every((folder) => typeof folder === 'string')) {
    throw new Error('--duplicate-skipped-folders must be a JSON array of folder names');
  }
  return folders;
}

function optionPairs(argumentList, usage, allowed) {
  const pairs = [];
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

function valuesOf(pairs, option) {
  return pairs.filter(([name]) => name === option).map(([, value]) => value);
}

function readOptionValues(argumentList, usage, allowed) {
  const pairs = optionPairs(argumentList, usage, allowed);
  const values = new Map(pairs.filter(([name]) => !REPEATED_OPTIONS.includes(name)));
  if (!values.has('--project-root')) {
    throw new Error(usage);
  }
  return {
    values,
    exclude: valuesOf(pairs, '--exclude'),
    exceptions: valuesOf(pairs, '--exception').map((value) => parseException(value, usage)),
  };
}

function checkChoices(values, choices) {
  for (const [option, allowed] of Object.entries(choices)) {
    const chosen = values.get(option);
    if (chosen !== undefined && !allowed.includes(chosen)) {
      throw new Error(`${option} must be one of: ${allowed.join(', ')}`);
    }
  }
}

export function parseRunnerArguments(
  argumentList,
  { runner = 'runner', choices = {}, precedenceTools = [] } = {},
) {
  const usage = usageOf(runner, choices, precedenceTools);
  const allowed = [...RUNNER_OPTIONS, ...precedenceTools.map(precedenceOption)];
  const { values, exclude, exceptions } = readOptionValues(argumentList, usage, allowed);
  checkChoices(values, choices);
  const crapLimit = values.has('--crap-limit') ? Number(values.get('--crap-limit')) : undefined;
  if (crapLimit !== undefined && !(Number.isFinite(crapLimit) && crapLimit > 0)) {
    throw new Error('--crap-limit must be a positive number');
  }
  return {
    projectRoot: values.get('--project-root'),
    policy: {
      crapLimit,
      fileLimits: parseJsonObject(values.get('--file-limits'), '--file-limits'),
      testSeconds: parseJsonObject(values.get('--test-seconds'), '--test-seconds'),
      exclude,
      exceptions,
      legacyInventory: values.get('--legacy-inventory'),
      policyRoot: realpathOptional(values.get('--policy-root')),
      baselineRoot: realpathOptional(values.get('--baseline-root')),
      snapshot: values.get('--snapshot') ?? 'head',
      preset: values.get('--preset'),
      kotlinFormatter: values.get('--kotlin-formatter'),
      kotlinDetektConfig: values.get('--kotlin-detekt-config'),
      duplicateSkippedFolders: parseSkippedFolders(values.get('--duplicate-skipped-folders')),
      toolPrecedence: toolPrecedence(values, precedenceTools),
    },
  };
}

function precedenceOption(tool) {
  return `--${tool}-precedence`;
}

function toolPrecedence(values, precedenceTools) {
  const chosen = precedenceTools.filter((tool) => values.has(precedenceOption(tool)));
  return chosen.length === 0
    ? undefined
    : Object.fromEntries(
        chosen.map((tool) => [tool, values.get(precedenceOption(tool)).split(',')]),
      );
}

const REPEATED_OPTIONS = ['--exclude', '--exception'];

const RUNNER_OPTIONS = [
  '--project-root',
  '--snapshot',
  '--policy-root',
  '--baseline-root',
  '--crap-limit',
  '--exclude',
  '--exception',
  '--legacy-inventory',
  '--preset',
  '--kotlin-formatter',
  '--kotlin-detekt-config',
  '--file-limits',
  '--test-seconds',
  '--duplicate-skipped-folders',
];

function parseJsonObject(text, option) {
  if (text === undefined) {
    return undefined;
  }
  const parsed = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${option} must be a JSON object`);
  }
  return parsed;
}

function realpathOptional(directory) {
  return directory === undefined ? undefined : realpathSync(directory);
}
