import { applyFindingPolicy as untypedApplyPolicy } from '../../../../shared/findings/finding-policy.mjs';
import { readHeadPolicyFile as untypedHeadPolicy } from '../../../../shared/head-policy.mjs';
import { parseRunnerArguments as untypedParse } from '../../../../core/tooling/runner-arguments.mjs';
import { precedenceToolNames as untypedPrecedence } from '../../../java/adapters/gradle-presets.mts';
import { describeError as untypedDescribeError } from '../../../../shared/messages/error-chain.mjs';
import { sharedRouteRule as untypedSharedRouteRule } from '../../../../shared/exceptions/routes.mjs';
import {
  createGoContext as untypedCreateContext,
  readFormatReport as untypedReadFormat,
  runGoSteps as untypedRunSteps,
} from '../go-steps.mts';
import { readMutationFindings as untypedReadMutation } from '../mutation/go-mutation.mts';
import { readDeadcodeFindings as untypedReadDeadcode } from '../dead-code/go-deadcode.mts';
import { readTidyFindings as untypedReadTidy } from '../dead-code/go-mod-tidy.mts';
import { readGoDuplicateFindings as untypedReadDuplicates } from '../duplicates/go-duplicates.mts';
import { formatFindings as untypedFormatFindings } from '../formatting/go-format.mts';
import { lintFindings as untypedLintFindings } from '../lint/go-lint.mts';
import { fieldOf, fieldsOf, listOf, textOf, textsOf } from '../../../../shared/values/readers.mts';
import { callUntyped as call } from '../../../../shared/values/boundaries/untyped-call.mts';
import { isRow } from './row-readers.mts';
import type { Environment } from '../../../../shared/processes/environment.mts';
import type { FindingRow, GoContext, GoFacts, GoPolicy, Spawn, ToolFailure } from '../go-types.mts';

function isFailure(value: unknown): value is ToolFailure {
  return typeof fieldOf(value, 'message') === 'string';
}

function rowsOf(value: unknown): FindingRow[] {
  return listOf(value).filter(isRow);
}

function isGoContext(value: unknown): value is GoContext {
  return (
    typeof fieldOf(value, 'projectRoot') === 'string' &&
    typeof fieldOf(value, 'reportRoot') === 'string' &&
    typeof fieldOf(value, 'module') === 'string' &&
    typeof fieldOf(value, 'settings') === 'object'
  );
}

export function createGoContext(options: {
  projectRoot: string;
  settings: object;
  policy: GoPolicy;
  reportRoot: string;
  spawn: Spawn | undefined;
  environment: Environment | undefined;
}): GoContext {
  const context = call(untypedCreateContext, options);
  if (!isGoContext(context)) {
    throw new TypeError('The Go context has an unexpected shape');
  }
  return context;
}

export function runGoSteps(context: GoContext, part: string): ToolFailure[] {
  return listOf(call(untypedRunSteps, context, part)).filter(isFailure);
}

export function readFormatReport(reportRoot: string): Readonly<Record<string, readonly string[]>> {
  const report = fieldsOf(call(untypedReadFormat, reportRoot));
  return Object.fromEntries(Object.entries(report).map(([name, files]) => [name, textsOf(files)]));
}

export function readMutationFindings(context: object): FindingRow[] {
  return rowsOf(call(untypedReadMutation, context));
}

export function readDeadcodeFindings(
  context: GoContext,
  parts: { facts: GoFacts; testOnly: readonly FindingRow[]; unused: readonly FindingRow[] },
): FindingRow[] {
  return rowsOf(call(untypedReadDeadcode, context, parts));
}

export function readTidyFindings(context: GoContext): FindingRow[] {
  return rowsOf(call(untypedReadTidy, context));
}

export function readGoDuplicateFindings(reportRoot: string, projectRoot: string): FindingRow[] {
  return rowsOf(call(untypedReadDuplicates, reportRoot, projectRoot));
}

export function formatFindings(
  context: object,
  entry: { formatter: string; files: readonly string[] },
): FindingRow[] {
  return rowsOf(call(untypedFormatFindings, context, entry));
}

export function lintFindings(context: object): FindingRow[] {
  return rowsOf(call(untypedLintFindings, context));
}

export function sharedRouteRule(finding: FindingRow): string | undefined {
  const rule: unknown = call(untypedSharedRouteRule, finding);
  return typeof rule === 'string' ? rule : undefined;
}

export function applyFindingPolicy(
  findings: readonly FindingRow[],
  options: Readonly<Record<string, unknown>>,
): FindingRow[] {
  return rowsOf(call(untypedApplyPolicy, findings, options));
}

export function readHeadPolicyFile(
  environment: Environment | undefined,
): Readonly<Record<string, unknown>> {
  return fieldsOf(call(untypedHeadPolicy, environment));
}

export function parseSharedArguments(
  shared: readonly string[],
  runner: string,
): { projectRoot: string; policy: GoPolicy } {
  const parsed = call(untypedParse, shared, { runner, precedenceTools: call(untypedPrecedence) });
  return {
    projectRoot: textOf(fieldOf(parsed, 'projectRoot')),
    policy: fieldsOf(fieldOf(parsed, 'policy')),
  };
}

export function describeError(error: unknown): string {
  return textOf(call(untypedDescribeError, error));
}
