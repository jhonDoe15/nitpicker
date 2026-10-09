import { realpathSync } from 'node:fs';
import { collectJavaFindings } from './java-diff.mjs';

// Subprocess entry of the Java analyzer: runs the Gradle preset on one snapshot and prints
// `{ findings }`. A Gradle failure (no gradle binary, build or tool crash, unreadable reports) is
// reported as a `tool-error` finding with exit 0, so the comparison records it instead of crashing.

export const GRADLE_FAILURE_RULE = 'gradle-failure';
const MAX_MESSAGE_LENGTH = 4000;

/** Findings of one snapshot, or a single `tool-error` finding when the preset cannot run. */
export function analyzeJavaSnapshot(projectRoot, { gradle = process.env.NITPICKER_GRADLE } = {}) {
  try {
    return { findings: collectJavaFindings(projectRoot, { gradle: gradle || undefined }) };
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

function main(arguments_) {
  if (arguments_[0] !== '--project-root' || arguments_[1] === undefined) {
    throw new Error('Usage: java-runner.mjs --project-root <directory>');
  }
  process.stdout.write(`${JSON.stringify(analyzeJavaSnapshot(realpathSync(arguments_[1])))}\n`);
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
