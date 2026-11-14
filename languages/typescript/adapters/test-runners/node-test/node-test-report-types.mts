export type FailureDetail = {
  readonly expected: string;
  readonly actual: string;
  readonly formatted: true;
};

export type AssertionResult = {
  readonly fullName: string;
  readonly title: string;
  readonly status: 'pending' | 'failed' | 'passed';
  readonly failureMessages: readonly string[];
  readonly failureDetails?: readonly FailureDetail[];
  readonly duration: number | undefined;
  readonly location: { readonly line: number | undefined; readonly column: number | undefined };
};

export type PendingEntry = {
  readonly nesting: number;
  readonly entry: AssertionResult;
  readonly cancelled: boolean;
};

export type FileState = { pending: PendingEntry[]; loadFailures: string[]; stderr: string };

export type TestFailure = {
  readonly cause?: unknown;
  readonly message?: unknown;
  readonly failureType?: unknown;
};

export type ResultData = {
  readonly name: string;
  readonly nesting: number;
  readonly file?: string;
  readonly line?: number;
  readonly column?: number;
  readonly skip?: unknown;
  readonly todo?: unknown;
  readonly details?: {
    readonly type?: string;
    readonly duration_ms?: number;
    readonly error?: TestFailure;
  };
};

export type ResultEvent = { readonly type: 'test:pass' | 'test:fail'; readonly data: ResultData };

export type StderrEvent = {
  readonly type: 'test:stderr';
  readonly data: { readonly file?: string; readonly message?: unknown };
};

export type ReporterEvent =
  ResultEvent | StderrEvent | { readonly type: string; readonly data?: { readonly file?: string } };

export type NodeTestReport = {
  readonly numTotalTests: number;
  readonly numFailedTests: number;
  readonly testResults: readonly {
    readonly name: string;
    readonly status: 'failed' | 'passed';
    readonly message: string;
    readonly assertionResults: readonly AssertionResult[];
  }[];
};
