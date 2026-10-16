import { realpathSync } from 'node:fs';
import { readHeadPolicyFile } from '../../../shared/head-policy.mjs';
import { collectJavaFindings } from './java-diff.mjs';
import { detectJavaBuild } from '../builds/java-build.mjs';
import { GRADLE_PRESETS } from './gradle-presets.mjs';
import { EXCEPTION_SEPARATOR } from './java-policy.mjs';
import { PROJECT_TOOL_CONFIGS, STYLE_TOOL_NAMES } from './gradle-presets.mjs';
import { KOTLIN_FORMATTERS } from './kotlin/kotlin-options.mjs';

export const GRADLE_FAILURE_RULE = 'gradle-failure';
export const MAVEN_FAILURE_RULE = 'maven-failure';
const MAX_MESSAGE_LENGTH = 4000;

export function analyzeJavaSnapshot(
  projectRoot,
  { gradle = process.env.NITPICKER_GRADLE, maven = process.env.NITPICKER_MAVEN, policy } = {},
) {
  try {
    return {
      findings: collectJavaFindings(projectRoot, {
        gradle: gradle || undefined,
        maven: maven || undefined,
        policy,
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const rule =
      detectJavaBuild(projectRoot) === 'maven' ? MAVEN_FAILURE_RULE : GRADLE_FAILURE_RULE;
    return {
      findings: [
        {
          tool: policy?.preset ?? 'java',
          rule,
          path: '.',
          identity: rule,
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
  ' [--preset java|kotlin] [--kotlin-formatter ktlint|ktfmt|none]' +
  ' [--kotlin-detekt-config <path>] [--file-limits <json>] [--<tool>-precedence <layers>]...';

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
      toolPrecedence: toolPrecedence(values),
    },
  };
}

function toolPrecedence(values) {
  const chosen = PRECEDENCE_TOOLS.filter((tool) => values.has(`--${tool}-precedence`));
  return chosen.length === 0
    ? undefined
    : Object.fromEntries(
        chosen.map((tool) => [tool, values.get(`--${tool}-precedence`).split(',')]),
      );
}

const PRECEDENCE_TOOLS = [...PROJECT_TOOL_CONFIGS.keys(), ...STYLE_TOOL_NAMES];

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
  ...PRECEDENCE_TOOLS.map((tool) => `--${tool}-precedence`),
  '--file-limits',
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

function main(arguments_) {
  const { projectRoot, policy } = parseRunnerArguments(arguments_);
  const conventions = readHeadPolicyFile().conventions;
  const report = analyzeJavaSnapshot(realpathSync(projectRoot), {
    policy: { ...policy, conventions },
  });
  process.stdout.write(`${JSON.stringify(report)}\n`);
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
