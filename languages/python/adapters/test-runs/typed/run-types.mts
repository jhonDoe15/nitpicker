export type JunitFailure = {
  readonly line?: number | undefined;
  readonly message?: string | undefined;
};

export type JunitTestCase = {
  readonly file: string;
  readonly qualifiedClass: string;
  readonly runtimeId?: string;
  readonly marks?: readonly string[];
  readonly line: number | undefined;
  readonly className: string;
  readonly name: string | undefined;
  readonly functionName: string | undefined;
  readonly id: string;
  readonly seconds: number;
  readonly outcome: string;
  readonly failure?: JunitFailure;
};

export type Logical = {
  readonly first: number;
  last: number;
  readonly indent: number;
  readonly blank: boolean;
};

export type ScanState = { depth: number; quote: string; continued: boolean };

export type Source = { readonly lines: string[]; readonly logical: Logical[] };

export type FunctionBlock = {
  readonly name: string;
  readonly first: number;
  readonly definition: number;
  readonly last: number;
  readonly text: string;
  readonly owner: string;
  readonly marks: string[];
};

export type TestFailure = {
  readonly id: string;
  readonly file: string | undefined;
  readonly notRun: boolean;
  readonly failure?: (TracebackFailure & JunitFailure) | undefined;
};

export type TracebackFailure = {
  readonly path?: string | undefined;
  readonly line?: number | undefined;
  readonly message?: string | undefined;
};

export type FailureManifest = {
  readonly testFailures?: readonly TestFailure[];
  readonly testRunner?: string | undefined;
};

export type Collected = { readonly file: string; readonly className: string };

export type Measured = {
  readonly testCase: JunitTestCase;
  readonly collected: Collected;
  readonly block: FunctionBlock | undefined;
  readonly integration: boolean;
  readonly limit: number;
};

export type SlowOptions = {
  readonly reportRoot: string;
  readonly projectRoot: string;
  readonly limits?: unknown;
  readonly baselineRoot?: string | undefined;
  readonly snapshot?: string | undefined;
  readonly testRunner?: string | undefined;
  readonly testsRan?: unknown;
};

export type Budget = { readonly unitTestSeconds: number; readonly integrationTestSeconds: number };
