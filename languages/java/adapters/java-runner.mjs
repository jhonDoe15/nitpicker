import { realpathSync } from 'node:fs';
import { readHeadPolicyFile } from '../../../shared/head-policy.mjs';
import { collectJavaFindings } from './java-diff.mjs';
import { markLombokGeneratedCode } from './generated-code/lombok-config.mjs';
import { detectJavaBuild } from '../builds/java-build.mjs';
import { parseJavaRunnerArguments } from './java-policy.mjs';
import { javaStyle } from './style/java-style.mjs';
import { gradleBudget } from './gradle-wrapper/gradle-budget.mjs';

export const GRADLE_FAILURE_RULE = 'gradle-failure';
export const MAVEN_FAILURE_RULE = 'maven-failure';
const MAX_MESSAGE_LENGTH = 4000;

export function javaExecutionBudget(environment = process.env) {
  return gradleBudget(environment);
}

export function analyzeJavaSnapshot(
  projectRoot,
  {
    gradle = process.env.NITPICKER_GRADLE,
    maven = process.env.NITPICKER_MAVEN,
    policy,
    onNote,
  } = {},
) {
  try {
    const { note } = markLombokGeneratedCode(projectRoot);
    if (note !== undefined) {
      onNote?.(note);
    }
    return {
      findings: collectJavaFindings(projectRoot, {
        gradle: gradle || undefined,
        maven: maven || undefined,
        policy,
        budget: javaExecutionBudget(),
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

export function readRunnerPolicy(runnerArguments, environment = process.env) {
  const { projectRoot, policy } = parseJavaRunnerArguments(runnerArguments);
  const { conventions } = readHeadPolicyFile(environment);
  return { projectRoot, policy: { ...policy, conventions, javaStyle: javaStyle(conventions) } };
}

function main(arguments_, { stdout, stderr }) {
  const { projectRoot, policy } = readRunnerPolicy(arguments_);
  const report = analyzeJavaSnapshot(realpathSync(projectRoot), {
    policy,
    onNote(note) {
      stderr.write(`${note}\n`);
    },
  });
  stdout.write(`${JSON.stringify(report)}\n`);
}

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === import.meta.filename) {
  try {
    main(process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr });
  } catch (error) {
    process.stderr.write(
      `Java differential adapter failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 2;
  }
}
