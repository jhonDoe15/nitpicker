import { analyzerDeadlineMs as untypedDeadline } from '../../../../../shared/analyzer-timeouts/analyzer-timeouts.mjs';
import { applyFindingPolicy as untypedApplyPolicy } from '../../../../../shared/findings/finding-policy.mjs';
import { readHeadPolicyFile as untypedHeadPolicy } from '../../../../../shared/head-policy.mjs';
import { trackTemporaryPath as untypedTrack } from '../../../../../core/tooling/temporary-files.mjs';
import { withTroubleshooting as untypedTroubleshooting } from '../../../../../shared/messages/troubleshooting.mjs';
import { applyRuleHints as untypedHints } from '../../../rules/rule-hints.mjs';
import { parseRunnerArguments as untypedParse } from '../../../../../core/tooling/runner-arguments.mjs';
import { precedenceToolNames as untypedPrecedence } from '../../../../java/adapters/gradle-presets.mjs';
import {
  createToolContext as untypedContext,
  runPythonTools as untypedRunTools,
} from '../../python-tools.mjs';
import { mutationFindings as untypedMutation } from '../../mutation/python-mutation.mjs';
import { fieldOf, fieldsOf, listOf, textOf } from '../../../../../shared/values/readers.mts';
import { callUntyped as call } from '../../../../../shared/values/boundaries/untyped-call.mts';
import { isFinding } from '../report/finding-guards.mts';
import type { IngestedFinding } from '../report/report-types.mts';
import type { RunnerPolicy, ToolFailure } from './runner-types.mts';

function isFailure(value: unknown): value is ToolFailure {
  return typeof fieldOf(value, 'message') === 'string';
}

export function analyzerDeadlineMs(
  environment: Readonly<Record<string, string | undefined>>,
): unknown {
  return call(untypedDeadline, environment);
}

export function applyFindingPolicy(
  findings: readonly IngestedFinding[],
  options: Readonly<Record<string, unknown>>,
): IngestedFinding[] {
  return listOf(call(untypedApplyPolicy, findings, options)).filter(isFinding);
}

export function readHeadPolicyFile(): Readonly<Record<string, unknown>> {
  return fieldsOf(call(untypedHeadPolicy));
}

export function parseSharedArguments(shared: readonly string[]): {
  projectRoot: string;
  policy: RunnerPolicy;
} {
  const parsed = call(untypedParse, shared, {
    runner: 'python-runner.mjs',
    precedenceTools: call(untypedPrecedence),
  });
  return {
    projectRoot: textOf(fieldOf(parsed, 'projectRoot')),
    policy: fieldsOf(fieldOf(parsed, 'policy')),
  };
}

export type ToolContext = Readonly<Record<string, unknown>>;

function isContext(value: unknown): value is ToolContext {
  return typeof value === 'object' && value !== null;
}

export function createToolContext(options: Readonly<Record<string, unknown>>): ToolContext {
  const context = call(untypedContext, options);
  if (!isContext(context)) {
    throw new Error('The tool context is malformed');
  }
  return context;
}

export function runPythonTools(context: unknown): ToolFailure[] {
  return listOf(call(untypedRunTools, context)).filter(isFailure);
}

export function mutationFindings(context: unknown): IngestedFinding[] {
  return listOf(call(untypedMutation, context)).filter(isFinding);
}

export function trackTemporaryPath(filePath: string): string {
  return textOf(call(untypedTrack, filePath));
}

export function withTroubleshooting(message: string, anchor: unknown): string {
  return textOf(call(untypedTroubleshooting, message, anchor));
}

export function applyRuleHints(findings: readonly IngestedFinding[]): IngestedFinding[] {
  return listOf(call(untypedHints, findings)).filter(isFinding);
}
