import { realpathSync } from 'node:fs';
import { readHeadPolicyFile } from '../../../shared/head-policy.mjs';
import { collectJavaFindings } from './java-diff.mjs';
import { detectJavaBuild } from '../builds/java-build.mjs';
import { parseJavaRunnerArguments } from './java-policy.mjs';
import { javaStyle } from './style/java-style.mjs';
import { gradleBudget, mavenBudget } from './gradle-wrapper/gradle-budget.mjs';

export const GRADLE_FAILURE_RULE = 'gradle-failure';
export const MAVEN_FAILURE_RULE = 'maven-failure';
const MAX_MESSAGE_LENGTH = 4000;

export function javaExecutionBudget(environment = process.env) {
  const gradle = gradleBudget(environment);
  const maven = mavenBudget(environment);
  const configured = [
    ...(environment.NITPICKER_GRADLE_TIMEOUT_MINUTES === undefined ? [] : [gradle]),
    ...(environment.NITPICKER_MAVEN_TIMEOUT_MINUTES === undefined ? [] : [maven]),
  ];
  const budgets = configured.length === 0 ? [gradle] : configured;
  return {
    ...gradle,
    mavenCommandTimeoutMs: maven.commandTimeoutMs,
    analyzerTimeoutMs: Math.max(...budgets.map((budget) => budget.analyzerTimeoutMs)),
  };
}

export function analyzeJavaSnapshot(
  projectRoot,
  {
    gradle = process.env.NITPICKER_GRADLE,
    maven = process.env.NITPICKER_MAVEN,
    policy,
    spawn,
  } = {},
) {
  try {
    return {
      findings: collectJavaFindings(projectRoot, {
        gradle: gradle || undefined,
        maven: maven || undefined,
        policy,
        spawn,
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
  const { conventions, spring, springRoles, kotlin } = readHeadPolicyFile(environment);
  return {
    projectRoot,
    policy: {
      ...policy,
      conventions,
      javaStyle: javaStyle(conventions),
      ...(spring === true ? { spring } : {}),
      ...(springRoles === undefined ? {} : { springRoles }),
      kotlinFormatter: kotlin?.formatter ?? policy.kotlinFormatter,
    },
  };
}

export function runJava(runnerArguments, { spawn } = {}) {
  const { projectRoot, policy } = readRunnerPolicy(runnerArguments);
  return analyzeJavaSnapshot(realpathSync(projectRoot), { policy, spawn });
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
