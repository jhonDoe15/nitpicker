import { realpathSync } from 'node:fs';
import { readHeadPolicyFile } from '../../../shared/head-policy.mjs';
import { collectJavaReport } from './java-diff.mjs';
import { moduleImportsSection } from '../../../shared/history/co-change/dependencies/module-imports.mjs';
import { detectJavaBuild } from '../builds/java-build.mjs';
import { parseJavaRunnerArguments } from './java-policy.mjs';
import { featureLayout } from '../../../shared/rules/features/feature-roles.mjs';
import { javaStyle } from './style/java-style.mjs';
import { gradleBudget, mavenBudget } from './gradle-wrapper/gradle-budget.mjs';
import {
  TROUBLESHOOTING_ANCHORS,
  failureText,
  troubleshootingLinkOf,
} from '../../../shared/messages/troubleshooting.mjs';
import { TESTS_FAILED_RULE } from '../../../shared/rules/finding-helpers.mjs';

export const GRADLE_FAILURE_RULE = 'gradle-failure';
export const MAVEN_FAILURE_RULE = 'maven-failure';
const MAX_MESSAGE_LENGTH = 4000;
const MAX_TESTS_FAILED_LENGTH = 40_000;

function truncated(message, rule) {
  const limit = rule === TESTS_FAILED_RULE ? MAX_TESTS_FAILED_LENGTH : MAX_MESSAGE_LENGTH;
  if (message.length <= limit) {
    return message;
  }
  const link = troubleshootingLinkOf(message);
  const kept = message
    .replace(link ?? '', '')
    .trimEnd()
    .slice(0, limit);
  return `${kept}...${link === undefined ? '' : `\n${link}`}`;
}

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
    environment = process.env,
    gradle = environment.NITPICKER_GRADLE,
    maven = environment.NITPICKER_MAVEN,
    policy,
    spawn,
  } = {},
) {
  try {
    const { findings, imports } = collectJavaReport(projectRoot, {
      gradle: gradle || undefined,
      maven: maven || undefined,
      environment,
      policy,
      spawn,
      budget: javaExecutionBudget(),
    });
    return { findings, ...moduleImportsSection(imports, policy?.history) };
  } catch (error) {
    const rule = failureRule(error, projectRoot);
    const anchor =
      rule === MAVEN_FAILURE_RULE
        ? TROUBLESHOOTING_ANCHORS.mavenFails
        : TROUBLESHOOTING_ANCHORS.gradleFails;
    return {
      findings: [
        {
          tool: policy?.preset ?? 'java',
          rule,
          path: '.',
          identity: rule,
          message: truncated(failureText(error, anchor), rule),
          classification: 'tool-error',
        },
      ],
    };
  }
}

export function withHeadPolicy(policy, headPolicy) {
  const { conventions, spring, springRoles, featureFolders, layout, kotlin, history } = headPolicy;
  return {
    ...policy,
    conventions,
    javaStyle: javaStyle(conventions),
    ...(spring === true ? { spring } : {}),
    ...(featureFolders === true ? { featureFolders } : {}),
    ...(layout === undefined ? {} : { layout: featureLayout(layout) }),
    ...(springRoles === undefined ? {} : { springRoles }),
    kotlinFormatter: kotlin?.formatter ?? policy.kotlinFormatter,
    ...(kotlin === undefined ? {} : { kotlinFacts: kotlin }),
    ...(history === undefined ? {} : { history }),
  };
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
