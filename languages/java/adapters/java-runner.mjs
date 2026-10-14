import { realpathSync } from 'node:fs';
import { collectJavaFindings } from './java-diff.mjs';
import { parseRunnerArguments } from '../../../core/tooling/runner-arguments.mjs';

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
