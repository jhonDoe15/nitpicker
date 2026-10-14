import { realpathSync } from 'node:fs';
import { GRADLE_PRESETS } from '../../languages/java/adapters/gradle-presets.mjs';
import { KOTLIN_FORMATTERS } from '../../languages/java/adapters/kotlin-options.mjs';

export const EXCEPTION_SEPARATOR = ':';

const USAGE =
  'Usage: java-runner.mjs --project-root <directory> [--snapshot base|head] [--policy-root <directory>]' +
  ' [--baseline-root <directory>] [--crap-limit <number>] [--exclude <glob>]... [--exception <rule>:<glob>]... [--legacy-inventory <path>]' +
  ' [--preset java|kotlin] [--kotlin-formatter ktlint|ktfmt|none]' +
  ' [--kotlin-detekt-config <path>] [--file-limits <json>] [--duplicate-skipped-folders <json array>]';

function parseException(value) {
  const separator = value.indexOf(EXCEPTION_SEPARATOR);
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error(USAGE);
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

function optionPairs(arguments_) {
  const pairs = [];
  const remaining = arguments_.values();
  for (const name of remaining) {
    const value = remaining.next().value;
    if (!RUNNER_OPTIONS.includes(name) || value === undefined) {
      throw new Error(USAGE);
    }
    pairs.push([name, value]);
  }
  return pairs;
}

function valuesOf(pairs, option) {
  return pairs.filter(([name]) => name === option).map(([, value]) => value);
}

function readOptionValues(arguments_) {
  const pairs = optionPairs(arguments_);
  const values = new Map(pairs.filter(([name]) => !REPEATED_OPTIONS.includes(name)));
  if (!values.has('--project-root')) {
    throw new Error(USAGE);
  }
  return {
    values,
    exclude: valuesOf(pairs, '--exclude'),
    exceptions: valuesOf(pairs, '--exception').map(parseException),
  };
}

export function parseRunnerArguments(arguments_) {
  const { values, exclude, exceptions } = readOptionValues(arguments_);
  const crapLimit = values.has('--crap-limit') ? Number(values.get('--crap-limit')) : undefined;
  if (crapLimit !== undefined && !(Number.isFinite(crapLimit) && crapLimit > 0)) {
    throw new Error('--crap-limit must be a positive number');
  }
  const preset = values.get('--preset');
  const kotlinFormatter = values.get('--kotlin-formatter');
  if (preset !== undefined && !GRADLE_PRESETS.includes(preset)) {
    throw new Error(`--preset must be one of: ${GRADLE_PRESETS.join(', ')}`);
  }
  if (kotlinFormatter !== undefined && !KOTLIN_FORMATTERS.includes(kotlinFormatter)) {
    throw new Error(`--kotlin-formatter must be one of: ${KOTLIN_FORMATTERS.join(', ')}`);
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
      preset,
      kotlinFormatter,
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
