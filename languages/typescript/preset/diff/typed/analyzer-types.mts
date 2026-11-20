import type {
  HeadPolicyFile,
  ToolSettings,
  ToolSettingsMap,
} from '../../typed/head-policy-types.mts';

type InvocationRequest = {
  readonly projectRoot: string;
  readonly policyRoot: string;
  readonly toolRoot: string;
  readonly liveProjectRoot: string;
  readonly snapshot: string;
};

export type AnalyzerBody = {
  readonly name: string;
  inputs?: unknown;
  resolveVersion?: (projectRoot: string) => unknown;
  policyFromPackage?: true;
  timeoutScale?: unknown;
  memoryScale?: {
    readonly perThousandFilesMegabytes: number;
    readonly extensions: readonly string[];
  };
  readonly createInvocation: (request: InvocationRequest) => {
    readonly args: readonly string[];
    readonly [field: string]: unknown;
  };
  readonly [field: string]: unknown;
};

export type PackageAnalyzer = AnalyzerBody & { readonly cacheKeyFiles: readonly string[] };

export type NamedAnalyzer = { readonly name: string; readonly [field: string]: unknown };

export type BaseSetup = {
  readonly headPolicy?: HeadPolicyFile | undefined;
  readonly analyzers?: readonly NamedAnalyzer[] | undefined;
  readonly [field: string]: unknown;
};

export type BaseContext = {
  readonly headPolicy: HeadPolicyFile | undefined;
  readonly baseProjectRoot: string;
  readonly liveProjectRoot: string;
  readonly warn: (message: string) => void;
  readonly analyzers: readonly NamedAnalyzer[];
};

export type TestsPolicy = HeadPolicyFile & {
  readonly tools: ToolSettingsMap & { readonly tests: ToolSettings };
};

export type EslintSettings = {
  readonly name: string;
  readonly version: string;
  readonly configurationHash: string;
  readonly configRelativePath: string;
  readonly patterns: readonly string[];
  readonly exclusions: readonly string[];
  readonly policyFiles: readonly string[];
  readonly shardWeight: number;
  readonly colocatedWith: readonly string[] | undefined;
  readonly carriedBy: string | undefined;
  readonly carries: true | undefined;
  readonly policyFromPackage: true;
};

export type EntryPointSettings = {
  readonly version: string;
  readonly configurationHash: string;
  readonly exclusions: readonly string[];
  readonly sourceRoots: readonly string[];
  readonly shardWeight: number;
};

export type QualityAreaSettings = {
  readonly name: string;
  readonly kind: string | undefined;
  readonly version: string | undefined;
  readonly configurationHash: string;
  readonly exclusions: readonly string[];
  readonly timeoutMs: number | undefined;
  readonly timeoutScale: unknown;
  readonly dependencies: readonly string[] | undefined;
  readonly adapterArguments: readonly string[] | undefined;
  readonly concurrencyWeight: number | undefined;
  readonly concurrencyGroup: string | undefined;
  readonly executionPriority: number | undefined;
  readonly reportedTools: readonly string[] | undefined;
  readonly shardWeight: number;
  readonly publishesModuleImports: true | undefined;
};

export type StaticCheckSettings = {
  readonly name: string;
  readonly kind: string | undefined;
  readonly version: string | undefined;
  readonly configurationHash: string;
  readonly exclusions: readonly string[];
  readonly configRelativePath: string | undefined;
  readonly ignoreRelativePath: string | undefined;
  readonly patterns: readonly string[] | undefined;
  readonly includeOnly: undefined;
  readonly exclude: undefined;
  readonly timeoutMs: number | undefined;
  readonly timeoutScale: unknown;
  readonly shardWeight: number;
};
