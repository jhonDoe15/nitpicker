import { realpathSync } from 'node:fs';

export const EXCEPTION_SEPARATOR = ':';

const BASE_USAGE =
  ' --project-root <directory> [--snapshot base|head] [--policy-root <directory>]' +
  ' [--baseline-root <directory>] [--crap-limit <number>] [--exclude <glob>]... [--exception <rule>:<glob>]... [--legacy-inventory <path>]' +
  ' [--kotlin-detekt-config <path>] [--file-limits <json>] [--duplicate-skipped-folders <json array>]';

function usageOf(runner, choices) {
  const listed = Object.entries(choices).map(
    ([option, values]) => ` [${option} ${values.join('|')}]`,
  );
  return `Usage: ${runner}${BASE_USAGE}${listed.join('')}`;
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

function optionPairs(arguments_, usage) {
  const pairs = [];
  const remaining = arguments_.values();
  for (const name of remaining) {
    const value = remaining.next().value;
    if (!RUNNER_OPTIONS.includes(name) || value === undefined) {
      throw new Error(usage);
    }
    pairs.push([name, value]);
  }
  return pairs;
}

function valuesOf(pairs, option) {
  return pairs.filter(([name]) => name === option).map(([, value]) => value);
}

function readOptionValues(arguments_, usage) {
  const pairs = optionPairs(arguments_, usage);
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

export function parseRunnerArguments(arguments_, { runner = 'runner', choices = {} } = {}) {
  const usage = usageOf(runner, choices);
  const { values, exclude, exceptions } = readOptionValues(arguments_, usage);
  checkChoices(values, choices);
  const crapLimit = values.has('--crap-limit') ? Number(values.get('--crap-limit')) : undefined;
  if (crapLimit !== undefined && !(Number.isFinite(crapLimit) && crapLimit > 0)) {
    throw new Error('--crap-limit must be a positive number');
  }
  return {
    projectRoot: values.get('--project-root'),
    policy: {
      crapLimit,
      fileLimits: parseFileLimits(values.get('--file-limits')),
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
    },
  };
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
  '--duplicate-skipped-folders',
];

function parseFileLimits(text) {
  if (text === undefined) {
    return undefined;
  }
  const parsed = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('--file-limits must be a JSON object');
  }
  return parsed;
}

function realpathOptional(directory) {
  return directory === undefined ? undefined : realpathSync(directory);
}
