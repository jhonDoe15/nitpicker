import type { NodeToolResult } from '../../static-checks/shared.mts';
import type {
  RunnerCommand,
  RunnerName,
  TestOptions,
  TestReport,
  TestRunner,
} from './runner-types.mts';
import type { TimeoutPolicy } from './timeouts.mts';
import { spawnNodeTool as spawnUntypedNodeTool } from '../../quality-areas/runners/tooling.mjs';
import { withoutOptions as untypedWithoutOptions } from '../../../preset/test-runner/script-command.mjs';
import { projectTestRunner as untypedProjectTestRunner } from '../../../preset/test-runner/project-runner.mjs';
import { projectTestRetry as untypedProjectTestRetry } from '../../../preset/project-configs/test-runner/test-runner-config.mjs';
import { vitestRetryArguments as untypedVitestRetryArguments } from '../../../preset/project-configs/test-runner/test-retry.mjs';
import {
  mochaMutationOptions as untypedMochaMutationOptions,
  projectMocha as untypedProjectMocha,
} from '../../../preset/test-runner/mocha-options.mjs';
import { readHeadPolicyFile as untypedReadHeadPolicyFile } from '../../../../../shared/head-policy.mjs';
import {
  formatProcessOutput as untypedFormatProcessOutput,
  readTestReport as untypedReadTestReport,
} from '../../quality-areas/reporting/test-report.mjs';
import {
  consoleEntry as untypedConsoleEntry,
  writeReportFile as untypedWriteReportFile,
} from '../../../preset/test-console/console-report.mjs';
import { findPackageJSON as untypedFindPackageJson } from '../../../../../core/tooling/package-lookup/package-json.mjs';
import { fieldOf, textsOf } from '../../../../../shared/values/readers.mts';

type OptionSets = {
  readonly flags?: readonly string[];
  readonly valued?: readonly string[];
  readonly variadic?: readonly string[];
};

export type NodeToolSpawn = {
  readonly options: TestOptions;
  readonly relativeToolPath?: string;
  readonly absoluteToolPath?: string;
  readonly arguments_: readonly string[];
  readonly nodeArguments?: readonly string[];
  readonly nodeOptions?: readonly string[] | undefined;
  readonly environment?: Readonly<Record<string, string>>;
};

export type ConsoleCall = {
  readonly content: string;
  readonly root: string;
  readonly file?: unknown;
  readonly test?: unknown;
};

function isNodeToolResult(value: unknown): value is NodeToolResult {
  return (
    typeof fieldOf(value, 'stdout') === 'string' && typeof fieldOf(value, 'stderr') === 'string'
  );
}

export function spawnNodeTool(invocation: NodeToolSpawn): NodeToolResult {
  const result: unknown = Reflect.apply(spawnUntypedNodeTool, undefined, [invocation]);
  if (!isNodeToolResult(result)) {
    throw new TypeError('The tool run did not return its output');
  }
  return result;
}

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

export const projectTestRetry: (runner: string) => unknown = untypedProjectTestRetry;

export const vitestRetryArguments: (retry: unknown) => string[] = untypedVitestRetryArguments;

export const projectMocha: (projectRoot: string) => { readonly major: number } | undefined =
  untypedProjectMocha;

export const mochaMutationOptions: (request: {
  readonly projectRoot: string;
  readonly tokens: readonly string[];
  readonly testFiles: readonly string[];
}) => { readonly mochaOptions: unknown; readonly nodeArguments: readonly string[] } =
  untypedMochaMutationOptions;

export const readHeadPolicyFile: () => TimeoutPolicy = untypedReadHeadPolicyFile;

export const readTestReportJson: (
  reportPath: string,
  result: NodeToolResult,
  context: { readonly runnerName: string; readonly snapshot: string },
) => unknown = untypedReadTestReport;

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

export const formatProcessOutput: (result: NodeToolResult) => string = untypedFormatProcessOutput;

export function consoleEntry(call: ConsoleCall): unknown {
  return called(untypedConsoleEntry, [call]);
}

export const writeReportFile: (reportPath: string, entries: readonly unknown[]) => void =
  untypedWriteReportFile;

export function findPackageJson(specifier: string, base: string): string | undefined {
  const found = called(untypedFindPackageJson, [specifier, base]);
  return typeof found === 'string' ? found : undefined;
}
