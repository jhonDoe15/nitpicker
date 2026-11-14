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
  MINUTE_MS,
  analyzerDeadlineMs,
} from '../../../shared/analyzer-timeouts/analyzer-timeouts.mjs';
import {
  TROUBLESHOOTING_ANCHORS,
  failureText,
  troubleshootingLinkOf,
  withTroubleshooting,
} from '../../../shared/messages/troubleshooting.mjs';
import { TESTS_FAILED_RULE } from '../../../shared/rules/finding-helpers.mjs';
import { GRADLE_LOG_LINE } from './gradle-wrapper/diagnostics/failure-log.mjs';
import {
  compileErrorFindings,
  compileErrorsOf,
} from '../builds/compile-errors/compile-findings.mjs';

export const GRADLE_FAILURE_RULE = 'gradle-failure';
export const MAVEN_FAILURE_RULE = 'maven-failure';
export const INTERNAL_ERROR_RULE = 'internal-error';
const INTERNAL_ERRORS = [TypeError, RangeError, ReferenceError, SyntaxError];
const MAX_MESSAGE_LENGTH = 4000;
const MAX_TESTS_FAILED_LENGTH = 40_000;
const PIT_RESERVE_MS = 2 * MINUTE_MS;

function truncated(message, rule) {
  const limit = rule === TESTS_FAILED_RULE ? MAX_TESTS_FAILED_LENGTH : MAX_MESSAGE_LENGTH;
  if (message.length <= limit) {
    return message;
  }
  const link = troubleshootingLinkOf(message);
  const kept = message.replace(link ?? '', '').trimEnd();
  const logAt = kept.lastIndexOf(`\n${GRADLE_LOG_LINE}`);
  const [body, log] = logAt < 0 ? [kept, ''] : [kept.slice(0, logAt), kept.slice(logAt)];
  const cut = body.length > limit ? `${body.slice(0, limit)}...` : body;
  return `${cut}${log}${link === undefined ? '' : `\n${link}`}`;
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

export function withPitDeadline(budget, environment, now = Date.now()) {
  const analyzerMs = analyzerDeadlineMs(environment) ?? budget.analyzerTimeoutMs;
  return { ...budget, pitDeadlineMs: now + analyzerMs - PIT_RESERVE_MS };
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
      budget: withPitDeadline(javaExecutionBudget(), environment),
    });
    return { findings, ...moduleImportsSection(imports, policy?.history) };
  } catch (error) {
    const compileErrors = policy?.snapshot === 'base' ? [] : compileErrorsOf(error);
    if (compileErrors.length > 0) {
      return { findings: compileErrorFindings(compileErrors, policy?.preset ?? 'java') };
    }
    const preset = policy?.preset ?? 'java';
    const rule = failureRule(error, projectRoot);
    return {
      findings: [
        {
          tool: preset,
          rule,
          path: '.',
          identity: rule,
          message: truncated(failureMessage(error, rule, preset), rule),
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

function isInternalError(error) {
  return INTERNAL_ERRORS.some((type) => error instanceof type);
}

function failureRule(error, projectRoot) {
  if (error?.failures?.length > 0) {
    return TESTS_FAILED_RULE;
  }
  if (isInternalError(error)) {
    return INTERNAL_ERROR_RULE;
  }
  return detectJavaBuild(projectRoot) === 'maven' ? MAVEN_FAILURE_RULE : GRADLE_FAILURE_RULE;
}

function failureMessage(error, rule, preset) {
  if (rule === INTERNAL_ERROR_RULE) {
    return withTroubleshooting(
      `Internal error in the ${preset} analyzer: ${error.message}`,
      TROUBLESHOOTING_ANCHORS.analyzerCrashed,
    );
  }
  const anchor =
    rule === MAVEN_FAILURE_RULE
      ? TROUBLESHOOTING_ANCHORS.mavenFails
      : TROUBLESHOOTING_ANCHORS.gradleFails;
  return failureText(error, anchor);
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
