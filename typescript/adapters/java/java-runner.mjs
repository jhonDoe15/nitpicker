import { realpathSync } from 'node:fs';
import { collectJavaFindings } from './java-diff.mjs';

// Subprocess entry of the Java analyzer: runs the Gradle preset on one snapshot and prints
// `{ findings }`. A Gradle failure (no gradle binary, build or tool crash, unreadable reports) is
// reported as a `tool-error` finding with exit 0, so the comparison records it instead of crashing.

export const GRADLE_FAILURE_RULE = 'gradle-failure';
const MAX_MESSAGE_LENGTH = 4000;

/** Findings of one snapshot, or a single `tool-error` finding when the preset cannot run. */
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
          tool: 'java',
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
  ' [--baseline-root <directory>] [--crap-limit <number>] [--exclude <glob>]... [--legacy-inventory <path>]';

/** Parses the runner arguments; `--exclude` may repeat. */
export function parseRunnerArguments(arguments_) {
  const values = new Map();
  const exclude = [];
  for (let index = 0; index < arguments_.length; index += 2) {
    const [name, value] = [arguments_[index], arguments_[index + 1]];
    if (!RUNNER_OPTIONS.includes(name) || value === undefined) {
      throw new Error(USAGE);
    }
    if (name === '--exclude') {
      exclude.push(value);
    } else {
      values.set(name, value);
    }
  }
  if (!values.has('--project-root')) {
    throw new Error(USAGE);
  }
  const crapLimit = values.has('--crap-limit') ? Number(values.get('--crap-limit')) : undefined;
  if (crapLimit !== undefined && !(Number.isFinite(crapLimit) && crapLimit > 0)) {
    throw new Error('--crap-limit must be a positive number');
  }
  return {
    projectRoot: values.get('--project-root'),
    policy: {
      crapLimit,
      exclude,
      legacyInventory: values.get('--legacy-inventory'),
      policyRoot: realpathOptional(values.get('--policy-root')),
      baselineRoot: realpathOptional(values.get('--baseline-root')),
      snapshot: values.get('--snapshot') ?? 'head',
    },
  };
}

const RUNNER_OPTIONS = [
  '--project-root',
  '--snapshot',
  '--policy-root',
  '--baseline-root',
  '--crap-limit',
  '--exclude',
  '--legacy-inventory',
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
