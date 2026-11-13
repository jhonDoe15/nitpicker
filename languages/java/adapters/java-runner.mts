import { realpathSync } from 'node:fs';
import { readHeadPolicyFile } from '../../../shared/head-policy.mjs';
import { collectJavaReport } from './java-diff.mts';
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
} from '../../../shared/messages/troubleshooting.mjs';
import { TESTS_FAILED_RULE } from '../../../shared/rules/finding-helpers.mjs';
import { GRADLE_LOG_LINE } from './gradle-wrapper/diagnostics/failure-log.mjs';
import {
  compileErrorFindings,
  compileErrorsOf,
} from '../builds/compile-errors/compile-findings.mjs';
import {
  fieldOf,
  fieldsOf,
  listOf,
  numberOr,
  objectOf,
  textOf,
} from '../../../shared/values/readers.mts';
import {
  type JavaEnvironment,
  type JavaFinding,
  type JavaPolicy,
  type JavaSpawn,
  callUntyped,
  javaPolicyOf,
} from './typed/java-values.mts';

type Budget = { readonly commandTimeoutMs: number; readonly analyzerTimeoutMs: number };
type JavaSnapshotOptions = {
  readonly environment?: JavaEnvironment;
  readonly gradle?: string | undefined;
  readonly maven?: string | undefined;
  readonly policy?: JavaPolicy | undefined;
  readonly spawn?: JavaSpawn | undefined;
};
type JavaSnapshot = {
  readonly findings: readonly JavaFinding[];
  readonly [section: string]: unknown;
};

export const GRADLE_FAILURE_RULE = 'gradle-failure';
export const MAVEN_FAILURE_RULE = 'maven-failure';
const MAX_MESSAGE_LENGTH = 4000;
const MAX_TESTS_FAILED_LENGTH = 40_000;
const PIT_RESERVE_MS = 2 * MINUTE_MS;

function truncated(message: string, rule: string): string {
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

function budgetOf(value: unknown): Budget {
  return {
    commandTimeoutMs: numberOr(fieldOf(value, 'commandTimeoutMs'), 0),
    analyzerTimeoutMs: numberOr(fieldOf(value, 'analyzerTimeoutMs'), 0),
  };
}

export function javaExecutionBudget(environment: JavaEnvironment = process.env): Budget & {
  readonly mavenCommandTimeoutMs: number;
} {
  const gradle = budgetOf(gradleBudget(environment));
  const maven = budgetOf(mavenBudget(environment));
  const configured = [
    ...(environment['NITPICKER_GRADLE_TIMEOUT_MINUTES'] === undefined ? [] : [gradle]),
    ...(environment['NITPICKER_MAVEN_TIMEOUT_MINUTES'] === undefined ? [] : [maven]),
  ];
  const budgets = configured.length === 0 ? [gradle] : configured;
  return {
    ...gradle,
    mavenCommandTimeoutMs: maven.commandTimeoutMs,
    analyzerTimeoutMs: Math.max(...budgets.map((budget) => budget.analyzerTimeoutMs)),
  };
}

export function withPitDeadline<T extends { readonly analyzerTimeoutMs: number }>(
  budget: T,
  environment: JavaEnvironment,
  now = Date.now(),
): T & { readonly pitDeadlineMs: number } {
  const analyzerMs = analyzerDeadlineMs(environment) ?? budget.analyzerTimeoutMs;
  return { ...budget, pitDeadlineMs: now + analyzerMs - PIT_RESERVE_MS };
}

export function analyzeJavaSnapshot(
  projectRoot: string,
  {
    environment = process.env,
    gradle = environment['NITPICKER_GRADLE'],
    maven = environment['NITPICKER_MAVEN'],
    policy,
    spawn,
  }: JavaSnapshotOptions = {},
): JavaSnapshot {
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
    const compileErrors =
      policy?.snapshot === 'base' ? [] : listOf(callUntyped(compileErrorsOf, error));
    if (compileErrors.length > 0) {
      return { findings: compileErrorFindings(compileErrors, policy?.preset ?? 'java') };
    }
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
          message: truncated(textOf(failureText(error, anchor)), rule),
          classification: 'tool-error',
        },
      ],
    };
  }
}

export function withHeadPolicy(policy: JavaPolicy, headPolicy: unknown): JavaPolicy {
  const { conventions, spring, springRoles, featureFolders, layout, kotlin, history } =
    fieldsOf(headPolicy);
  return {
    ...policy,
    conventions,
    javaStyle: javaStyle(conventions),
    ...(spring === true ? { spring } : {}),
    ...(featureFolders === true ? { featureFolders } : {}),
    ...(layout === undefined ? {} : { layout: featureLayout(objectOf(layout)) }),
    ...(springRoles === undefined ? {} : { springRoles }),
    kotlinFormatter: fieldOf(kotlin, 'formatter') ?? policy.kotlinFormatter,
    ...(kotlin === undefined ? {} : { kotlinFacts: kotlin }),
    ...(history === undefined ? {} : { history }),
  };
}

function hasFailures(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'failures' in error &&
    Array.isArray(error.failures) &&
    error.failures.length > 0
  );
}

function failureRule(error: unknown, projectRoot: string): string {
  if (hasFailures(error)) {
    return TESTS_FAILED_RULE;
  }
  return detectJavaBuild(projectRoot) === 'maven' ? MAVEN_FAILURE_RULE : GRADLE_FAILURE_RULE;
}

export function readRunnerPolicy(
  runnerArguments: readonly string[],
  environment: JavaEnvironment = process.env,
): { readonly projectRoot: string; readonly policy: JavaPolicy } {
  const parsed: unknown = parseJavaRunnerArguments(runnerArguments);
  const head: unknown = readHeadPolicyFile(environment);
  return {
    projectRoot: textOf(fieldOf(parsed, 'projectRoot')),
    policy: withHeadPolicy(javaPolicyOf(fieldOf(parsed, 'policy')), head),
  };
}

export function runJava(
  runnerArguments: readonly string[],
  { spawn }: { readonly spawn?: JavaSpawn } = {},
): JavaSnapshot {
  const { projectRoot, policy } = readRunnerPolicy(runnerArguments);
  return analyzeJavaSnapshot(realpathSync.native(projectRoot), { policy, spawn });
}

function main(runnerArguments: readonly string[]): void {
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
