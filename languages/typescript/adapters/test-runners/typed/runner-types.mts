import type { QualityAreaOptions } from '../../quality-areas/typed/area-types.mts';
import type { NodeToolResult } from '../../static-checks/shared.mts';

export type RunnerName = 'vitest' | 'jest' | 'node' | 'mocha';

export type Rerun = {
  readonly files: readonly string[];
  readonly namePattern?: string | undefined;
  readonly withoutMockPin?: boolean | undefined;
};

export type TestOptions = QualityAreaOptions & { readonly rerun?: Rerun | undefined };

export type Environment = Readonly<Record<string, string>>;

export type RunnerCommand = {
  readonly launcher?: string | undefined;
  readonly arguments_: readonly string[];
  readonly nodeArguments: readonly string[];
  readonly nodeOptions?: readonly string[];
  readonly environment: Environment;
  readonly precedingCommands?: unknown;
};

export type TestRunner = { readonly runner: RunnerName; readonly command: RunnerCommand };

export type FailureDetail = {
  readonly expected: unknown;
  readonly actual: unknown;
  readonly formatted: true;
};

export type AssertionResult = {
  readonly fullName?: string | undefined;
  readonly title?: string | undefined;
  readonly status?: string;
  readonly duration?: number | undefined;
  readonly failureMessages?: readonly string[];
  failureDetails?: readonly FailureDetail[];
};

export type TestFileResult = {
  readonly name?: string | undefined;
  readonly status?: string;
  readonly message?: string;
  readonly assertionResults?: readonly AssertionResult[];
};

export type TestReport = {
  readonly success?: unknown;
  readonly snapshot?: { readonly failure?: unknown };
  readonly numTotalTests?: number;
  readonly numFailedTests?: number;
  readonly numTotalTestSuites?: number;
  readonly numFailedTestSuites?: number;
  readonly numRuntimeErrorTestSuites?: number;
  readonly wasInterrupted?: unknown;
  readonly testResults?: readonly TestFileResult[];
};

export type TestRun = {
  readonly failed: boolean;
  readonly report: TestReport;
  readonly result: NodeToolResult;
  readonly runnerName: string;
};

export type CoverageRun = {
  readonly nodeArguments: readonly string[];
  readonly environment: Environment;
  readonly write: () => Promise<void>;
  readonly remove: () => void;
};

export type TestConsole = {
  readonly enabled: boolean;
  readonly environment: Environment;
  finish(): void;
  remove(): void;
};

export type TimeoutLimits = {
  readonly testTimeoutMs: number;
  readonly hookTimeoutMs?: number | undefined;
  readonly [limit: string]: unknown;
};
