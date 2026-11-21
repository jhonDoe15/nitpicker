import type { NodeToolResult } from '../../static-checks/shared.mts';
import type { RunnerCommand, TestOptions, TestReport, TestRunner } from './runner-types.mts';
import type { TimeoutPolicy } from './timeouts.mts';
import type { RunnerName } from '../../../preset/test-runner/typed/command-types.mts';
import { withoutOptions as untypedWithoutOptions } from '../../../preset/test-runner/script-command.mts';
import { projectTestRunner as untypedProjectTestRunner } from '../../../preset/test-runner/project-runner.mts';
import { projectTestRetry as untypedProjectTestRetry } from '../../../preset/project-configs/test-runner/test-runner-config.mts';
import { vitestRetryArguments as untypedVitestRetryArguments } from '../../../preset/project-configs/test-runner/test-retry.mts';
import {
  mochaMutationOptions as untypedMochaMutationOptions,
  projectMocha as untypedProjectMocha,
} from '../../../preset/test-runner/test-files/mocha-options.mts';
import { readHeadPolicyFile as toolPolicy } from '../../../preset/project-tools/typed/shared-views.mts';
import { readHeadPolicyFile as untypedReadHeadPolicyFile } from '../../../../../shared/head-policy.mts';
import { readTestReport as readTestReportJson } from '../../quality-areas/reporting/test-report.mts';
import {
  consoleEntry as untypedConsoleEntry,
  writeReportFile as untypedWriteReportFile,
} from '../../../preset/test-console/console-report.mts';
import { fieldOf, textsOf } from '../../../../../shared/values/readers.mts';

type OptionSets = {
  readonly flags?: readonly string[];
  readonly valued?: readonly string[];
  readonly variadic?: readonly string[];
};

export type ConsoleCall = {
  readonly content: string;
  readonly root: string;
  readonly file?: unknown;
  readonly test?: unknown;
};

export { spawnNodeTool } from '../../quality-areas/runners/tooling.mts';

function called(untyped: unknown, values: readonly unknown[]): unknown {
  if (typeof untyped !== 'function') {
    throw new TypeError('The preset helper is not a function');
  }
  const result: unknown = Reflect.apply(untyped, undefined, values);
  return result;
}

function isRunnerName(value: unknown): value is RunnerName {
  return value === 'vitest' || value === 'jest' || value === 'node' || value === 'mocha';
}

function isRunnerCommand(value: unknown): value is RunnerCommand {
  return (
    Array.isArray(fieldOf(value, 'arguments_')) && Array.isArray(fieldOf(value, 'nodeArguments'))
  );
}

export function withoutOptions(tokens: readonly string[], sets: OptionSets): string[] {
  return textsOf(called(untypedWithoutOptions, [tokens, sets]));
}

export function projectTestRunner(options: TestOptions): TestRunner {
  const detected = called(untypedProjectTestRunner, [options]);
  const runner = fieldOf(detected, 'runner');
  const command = fieldOf(detected, 'command');
  if (!(isRunnerName(runner) && isRunnerCommand(command))) {
    throw new TypeError('The project test runner was not detected');
  }
  return { runner, command };
}

export function projectTestRetry(
  runner: string,
  environment: Readonly<Record<string, string | undefined>>,
): unknown {
  return untypedProjectTestRetry(runner, toolPolicy(environment).tools?.['tests']);
}

export const vitestRetryArguments: (retry: unknown) => string[] = untypedVitestRetryArguments;

export const projectMocha: (projectRoot: string) => { readonly major: number } | undefined =
  untypedProjectMocha;

export const mochaMutationOptions: (request: {
  readonly projectRoot: string;
  readonly tokens: readonly string[];
  readonly testFiles: readonly string[];
}) => {
  readonly mochaOptions: {
    readonly require?: readonly string[];
    readonly [option: string]: unknown;
  };
  readonly nodeArguments: readonly string[];
} = untypedMochaMutationOptions;

export const readHeadPolicyFile: (
  environment: Readonly<Record<string, string | undefined>>,
) => TimeoutPolicy = untypedReadHeadPolicyFile;

function isTestReport(value: unknown): value is TestReport {
  return typeof value === 'object' && value !== null;
}

export function readTestReport(
  reportPath: string,
  result: NodeToolResult,
  context: { readonly runnerName: string; readonly snapshot: string },
): TestReport {
  const report = readTestReportJson(reportPath, result, context);
  if (!isTestReport(report)) {
    throw new TypeError(`${context.runnerName} wrote a test report that is not an object`);
  }
  return report;
}

export function consoleEntry(call: ConsoleCall): unknown {
  return called(untypedConsoleEntry, [call]);
}

export const writeReportFile: (reportPath: string, entries: readonly unknown[]) => void =
  untypedWriteReportFile;
