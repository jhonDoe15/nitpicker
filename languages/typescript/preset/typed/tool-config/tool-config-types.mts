import type { PolicyLayout } from '../layout-types.mts';

export type ToolLayout = Pick<
  PolicyLayout,
  'sourceRoots' | 'testRoots' | 'exclude' | 'javascript' | 'projectCodeFiles' | 'isRunnableTestFile'
> & {
  readonly duplicateSkippedFolders?: PolicyLayout['duplicateSkippedFolders'];
  readonly typescriptProject?: PolicyLayout['typescriptProject'];
  readonly typescriptSettings?: PolicyLayout['typescriptSettings'];
  readonly executedTestRoots?: readonly string[] | undefined;
  readonly entryPoints?: readonly string[] | undefined;
};

export type Tsconfig = {
  readonly compilerOptions?: Readonly<Record<string, unknown>> | undefined;
  readonly include: readonly string[];
  readonly exclude: readonly string[];
  readonly [field: string]: unknown;
};

export type RewrittenTsconfig = Tsconfig & { include: string[]; exclude: string[] };

export type KnipConfig = {
  readonly entry: readonly string[];
  readonly project: readonly string[];
  readonly ignore: readonly string[];
  readonly [field: string]: unknown;
};

export type JscpdConfig = {
  readonly format: readonly string[];
  readonly path: readonly string[];
  readonly ignore: readonly string[];
  readonly [field: string]: unknown;
};

export type ConfigRewrite = (base: unknown, layout: ToolLayout) => unknown;

export type TransformOptions = Partial<{ strictMutants: boolean; projectRootFiles: boolean }>;

export type MutationTsconfigInput = {
  readonly strictMutants: boolean;
  readonly layout: ToolLayout;
  readonly projectDirectory: string;
};
