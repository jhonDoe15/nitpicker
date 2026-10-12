import { realpathSync } from 'node:fs';
import { collectJavaFindings } from './java-diff.mjs';
import { EXCEPTION_SEPARATOR } from './java-policy.mjs';
import { KOTLIN_FORMATTERS } from './kotlin-options.mjs';

export const GRADLE_FAILURE_RULE = 'gradle-failure';
const MAX_MESSAGE_LENGTH = 4000;

export function analyzeJavaSnapshot(
  projectRoot,
  { gradle = process.env.NITPICKER_GRADLE, policy } = {},
) {
  try {
    return { findings: collectJavaFindings(projectRoot, { gradle: gradle || undefined, policy }) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      findings: [
        {
          tool: policy?.preset ?? 'java',
          rule: GRADLE_FAILURE_RULE,
          path: '.',
          identity: GRADLE_FAILURE_RULE,
          message:
            message.length > MAX_MESSAGE_LENGTH
              ? `${message.slice(0, MAX_MESSAGE_LENGTH)}...`
              : message,
          classification: 'tool-error',
        },
      ],
    };
  }
}

const USAGE =
  'Usage: java-runner.mjs --project-root <directory> [--snapshot base|head] [--policy-root <directory>]' +
  ' [--baseline-root <directory>] [--crap-limit <number>] [--exclude <glob>]... [--exception <rule>:<glob>]... [--legacy-inventory <path>]' +
  ' [--preset java|kotlin] [--kotlin-formatter ktlint|ktfmt]';

function parseException(value) {
  const separator = value.indexOf(EXCEPTION_SEPARATOR);
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error(USAGE);
  }
  return { rule: value.slice(0, separator), glob: value.slice(separator + 1) };
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

function readOptionValues(arguments_) {
  const pairs = optionPairs(arguments_);
  const values = new Map(pairs.filter(([name]) => !REPEATED_OPTIONS.includes(name)));
  if (!values.has('--project-root')) {
    throw new Error(USAGE);
  }
  const repeated = (option) => pairs.filter(([name]) => name === option).map(([, value]) => value);
  return {
    values,
    exclude: repeated('--exclude'),
    exceptions: repeated('--exception').map(parseException),
  };
}

export function parseRunnerArguments(arguments_) {
  const { values, exclude, exceptions } = readOptionValues(arguments_);
  const crapLimit = values.has('--crap-limit') ? Number(values.get('--crap-limit')) : undefined;
  if (crapLimit !== undefined && !(Number.isFinite(crapLimit) && crapLimit > 0)) {
    throw new Error('--crap-limit must be a positive number');
  }
  const preset = values.get('--preset') ?? 'java';
  const kotlinFormatter = values.get('--kotlin-formatter');
  if (!['java', 'kotlin'].includes(preset)) {
    throw new Error('--preset must be java or kotlin');
  }
  if (kotlinFormatter !== undefined && !KOTLIN_FORMATTERS.includes(kotlinFormatter)) {
    throw new Error(`--kotlin-formatter must be one of: ${KOTLIN_FORMATTERS.join(', ')}`);
  }
  return {
    projectRoot: values.get('--project-root'),
    policy: {
      crapLimit,
      exclude,
      exceptions,
      legacyInventory: values.get('--legacy-inventory'),
      policyRoot: realpathOptional(values.get('--policy-root')),
      baselineRoot: realpathOptional(values.get('--baseline-root')),
      snapshot: values.get('--snapshot') ?? 'head',
      preset,
      kotlinFormatter,
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
];

function realpathOptional(directory) {
  return directory === undefined ? undefined : realpathSync(directory);
}

function main(arguments_) {
  const { projectRoot, policy } = parseRunnerArguments(arguments_);
  process.stdout.write(
    `${JSON.stringify(analyzeJavaSnapshot(realpathSync(projectRoot), { policy }))}\n`,
  );
}

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === import.meta.filename) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(
      `Java differential adapter failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 2;
  }
}
