import type { Finding } from '../values/findings.mts';
import type { Environment } from '../processes/environment.mts';

export type ParseYaml = (text: string) => unknown[];

export type ExceptionEntry = {
  readonly rule: string;
  readonly paths: readonly string[];
  readonly packages?: readonly string[];
  readonly name?: string;
  readonly function?: string;
  readonly reason?: string;
};

export type HygienePolicy = {
  readonly exclude?: readonly string[];
  readonly exceptions?: readonly ExceptionEntry[];
};

export type PathFinding = Finding & { readonly exceptionPaths?: readonly string[] };

export type FindingDraft = {
  readonly tool: undefined;
  readonly rule: string;
  readonly path: string;
  readonly identity: string;
  readonly message: string;
  readonly classification: string;
  readonly location: { readonly line: number };
};

export type CheckArguments = {
  check?: string;
  projectRoot?: string;
  historyRef?: string;
  baselineRoot?: string;
};

export type CheckOptions = Readonly<CheckArguments> & { readonly policy: HygienePolicy };

type TextOutput = { readonly write: (text: string) => unknown };

export type CheckCliInput = {
  readonly commandArguments: readonly string[];
  readonly stdout: TextOutput;
  readonly stderr: TextOutput;
  readonly environment: Environment;
  readonly runCheck: (options: CheckOptions) => readonly unknown[];
  readonly label: string;
};

export type RepositoryContext = {
  readonly projectRoot: string;
  readonly files: readonly string[];
  readonly baselineRoot?: string | undefined;
  readonly baseFiles?: readonly string[] | undefined;
  readonly parseYaml?: ParseYaml | undefined;
};

export type InvocationContext = {
  readonly projectRoot: string;
  readonly toolRoot: string;
  readonly snapshot?: string | undefined;
  readonly baselineRoot?: string | undefined;
};

export type CheckAnalyzerOptions = {
  readonly name: string;
  readonly inputs: unknown;
  readonly command: string;
  readonly runner: string;
  readonly entryPath: string;
  readonly extraArguments?: (context: InvocationContext) => string[];
  readonly environmentToken?: ((policyRoot: string) => string) | undefined;
};

export type CheckAnalyzer = {
  readonly name: string;
  readonly inputs: unknown;
  readonly version: string;
  readonly configurationHash: string;
  readonly exclusions: readonly string[];
  readonly resolveConfigurationHash?: (policyRoot: string) => string;
  readonly createInvocation: (context: InvocationContext) => {
    readonly command: string;
    readonly args: string[];
    readonly cwd: string;
  };
};

export type HygieneCheck = {
  readonly check?: string | undefined;
  readonly projectRoot?: string | undefined;
  readonly policy?: HygienePolicy | undefined;
  readonly baselineRoot?: string | undefined;
  readonly parseYaml?: ParseYaml | undefined;
};
