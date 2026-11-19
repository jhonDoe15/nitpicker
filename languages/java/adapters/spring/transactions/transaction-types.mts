export type TransactionOptions = {
  readonly projectRoot: string;
  readonly roots: readonly string[];
};

export type RootsContext = {
  readonly projectRoot: string;
  readonly allSourceRoots?: readonly string[];
  readonly manifest?: {
    readonly sourceRoots?: readonly string[];
    readonly kotlinSourceRoots?: readonly string[];
  };
};

export type RootsInput = Omit<RootsContext, 'projectRoot'>;

export type CallSite = {
  readonly file: string;
  readonly offset: number;
  readonly reference: boolean;
};

export type CallSource = { readonly file: string; readonly text: string };

export type CallMatcher = { readonly test: (text: string) => boolean };

export type DelimiterEntry = { readonly character: string; readonly index: number };

export type StepOutcome = boolean | undefined;

export type BodyKind = 'block' | 'lambda' | 'class' | 'method';

export type CallState = {
  readonly text: string;
  readonly offset: number;
  readonly call: CallMatcher;
  readonly kotlin: boolean;
  crossed: boolean;
  method: string | undefined;
};

export type SiteInput = {
  readonly text: string;
  readonly stack: readonly DelimiterEntry[];
  readonly offset: number;
  readonly reference: boolean;
  readonly call: CallMatcher;
  readonly kotlin: boolean;
};

export type MethodName = {
  readonly name: string;
  readonly offset: number;
  readonly open: number;
};

export type MethodBody = { readonly begin: number; readonly end: number };

export type TransactionRun = {
  readonly calls: Map<string, CallSite[]>;
  readonly textOf: (file: string) => string;
  readonly stackAt: (file: string, offset: number) => readonly DelimiterEntry[];
  readonly templateOf: (file: string) => CallMatcher;
};

export type ClassHeader = {
  readonly name: string;
  readonly transactional: boolean;
  readonly supers: string[];
  readonly start: number;
  readonly end: number;
};

export type ReadSite = {
  readonly receiver: string;
  readonly name: string;
  readonly call: boolean;
  readonly field: boolean;
};

export type TypeBody = { readonly prefix: string; readonly body: string };
