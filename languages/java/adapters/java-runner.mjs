import { realpathSync } from 'node:fs';
import { readHeadPolicyFile } from '../../../shared/head-policy.mjs';
import { collectJavaFindings } from './java-diff.mjs';
import { detectJavaBuild } from '../builds/java-build.mjs';
import { parseJavaRunnerArguments } from './java-policy.mjs';
import { javaStyle } from './style/java-style.mjs';
import { gradleBudget } from './gradle-wrapper/gradle-budget.mjs';
import { TESTS_FAILED_RULE } from '../../../shared/rules/finding-helpers.mjs';

export const GRADLE_FAILURE_RULE = 'gradle-failure';
export const MAVEN_FAILURE_RULE = 'maven-failure';
const MAX_MESSAGE_LENGTH = 4000;
const MAX_TESTS_FAILED_LENGTH = 40_000;

export function javaExecutionBudget(environment = process.env) {
  return gradleBudget(environment);
}

export function analyzeJavaSnapshot(
  projectRoot,
  {
    environment = process.env,
    gradle = environment.NITPICKER_GRADLE,
    maven = environment.NITPICKER_MAVEN,
    policy,
    spawn,
  } = {},
) {
  try {
    return {
      findings: collectJavaFindings(projectRoot, {
        gradle: gradle || undefined,
        maven: maven || undefined,
        environment,
        policy,
        spawn,
        budget: javaExecutionBudget(),
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const rule = failureRule(error, projectRoot);
    return {
      findings: [
        {
          tool: policy?.preset ?? 'java',
          rule,
          path: '.',
          identity: rule,
          message: cappedMessage(message, rule),
          classification: 'tool-error',
        },
      ],
    };
  }
}

export function withHeadPolicy(policy, headPolicy) {
  const { conventions, spring, springRoles, kotlin, layout } = headPolicy;
  return {
    ...policy,
    conventions,
    javaStyle: javaStyle(conventions),
    ...(spring === true ? { spring } : {}),
    ...(springRoles === undefined ? {} : { springRoles }),
    ...(layout === undefined ? {} : { layout }),
    kotlinFormatter: kotlin?.formatter ?? policy.kotlinFormatter,
    ...(kotlin === undefined ? {} : { kotlinFacts: kotlin }),
  };
}

function cappedMessage(message, rule) {
  const limit = rule === TESTS_FAILED_RULE ? MAX_TESTS_FAILED_LENGTH : MAX_MESSAGE_LENGTH;
  return message.length > limit ? `${message.slice(0, limit)}...` : message;
}

function failureRule(error, projectRoot) {
  if (error?.failures?.length > 0) {
    return TESTS_FAILED_RULE;
  }
  return detectJavaBuild(projectRoot) === 'maven' ? MAVEN_FAILURE_RULE : GRADLE_FAILURE_RULE;
}

export function readRunnerPolicy(runnerArguments, environment = process.env) {
  const { projectRoot, policy } = parseJavaRunnerArguments(runnerArguments);
  return { projectRoot, policy: withHeadPolicy(policy, readHeadPolicyFile(environment)) };
}

export function runJava(runnerArguments, { spawn } = {}) {
  const { projectRoot, policy } = readRunnerPolicy(runnerArguments);
  return analyzeJavaSnapshot(realpathSync.native(projectRoot), { policy, spawn });
}

function main(runnerArguments) {
  process.stdout.write(`${JSON.stringify(runJava(runnerArguments))}\n`);
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
