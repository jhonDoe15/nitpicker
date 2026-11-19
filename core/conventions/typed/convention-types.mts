import type {
  ConventionDefinition,
  NitpickerConfig,
} from '../../../shared/values/config-types.mts';

export type { ConventionDefinition };

export type PathsOptions = { readonly unreadable?: true };

export type ConventionSource = {
  readonly paths: (options?: PathsOptions) => string[];
  readonly readMany: (files: readonly string[]) => Map<string, string>;
};

export type CommitRef = {
  readonly repositoryRoot: string;
  readonly commitSha: string;
};

export type ConfigRoot = {
  readonly path: string;
  readonly snapshot: 'base' | 'head';
  readonly dispose: () => void;
  readonly notes: readonly string[];
};

export type LazyConfigRoot = {
  readonly get: () => ConfigRoot;
  readonly notes: () => string[];
  readonly dispose: () => void;
};

type ProjectChoice = { readonly choice: unknown; readonly from: string };

export type StyleParts = {
  readonly unused: Readonly<Record<string, string>>;
  readonly project: Readonly<Record<string, ProjectChoice>>;
  readonly note: (id: string, choice: unknown) => string | undefined;
  readonly summary?: (conventions: unknown) => readonly string[];
  readonly derive?: (detected: unknown) => Readonly<Record<string, ProjectChoice>>;
};

export type StyleContext = {
  readonly config: NitpickerConfig;
  readonly projectRoot: string;
  readonly headPolicy: unknown;
  readonly source: ConventionSource;
  readonly configRoot: () => ConfigRoot;
};

export type StyleFactory = (context: StyleContext) => StyleParts;

type DetectedEntry = {
  readonly choice: unknown;
  readonly source?: string;
  readonly files?: number;
  readonly from?: string;
  readonly overrides?: unknown;
  readonly [field: string]: unknown;
};

export type DetectedConventions = Readonly<Record<string, DetectedEntry>>;

export type ResolvedLayout = {
  readonly isSourceFile: (file: string) => boolean;
  readonly isTestFile: (file: string) => boolean;
  readonly isGeneratedPath: (file: string) => boolean;
  readonly isFixturePath: (file: string) => boolean;
  readonly isExcluded: (file: string) => boolean;
  readonly formatExtensions: readonly string[];
  readonly sourceRoots: readonly string[];
  readonly testRoots: readonly string[];
};

export type GlobMatcher = { readonly test: (file: string) => boolean };

export type HeadPolicy = Readonly<Record<string, unknown>>;
export type ProjectChoices = Readonly<Record<string, ProjectChoice>>;
export type Pins = Readonly<Record<string, unknown>>;
export type Sources = {
  readonly head: ConventionSource;
  readonly base: ConventionSource | undefined;
};
export type Accepts = (definition: ConventionDefinition, file: string) => boolean;
type TextOutput = { readonly write: (chunk: string) => unknown };

export type ComparisonRun = {
  readonly config: NitpickerConfig;
  readonly currentProjectRoot: string;
  readonly headPolicy: unknown;
  readonly stdout?: TextOutput | undefined;
  readonly repositoryRoot: string;
  readonly base: { readonly baseRef: string };
};

export type ConventionContext = {
  readonly style: StyleParts;
  readonly ignored: readonly string[];
  readonly sources: Sources;
  readonly exclude: readonly string[];
  readonly accepts: Accepts | undefined;
  readonly definitions: readonly ConventionDefinition[];
};

export type FollowRequest = {
  readonly config: NitpickerConfig;
  readonly projectRoot: string;
  readonly headPolicy: unknown;
  readonly commit?: (() => CommitRef) | undefined;
  readonly stdout?: TextOutput | undefined;
};

export type ContextRequest = {
  readonly config: NitpickerConfig;
  readonly projectRoot: string;
  readonly headPolicy: HeadPolicy;
  readonly sources: Sources;
  readonly configRoot: LazyConfigRoot;
};

export type ReportRequest = {
  readonly detected: DetectedConventions;
  readonly followed: readonly ConventionDefinition[];
  readonly style: StyleParts;
  readonly conventions: Record<string, unknown>;
  readonly notes: readonly string[];
};

export type DetectRequest = {
  readonly definitions: readonly ConventionDefinition[];
  readonly pinned: Pins;
  readonly exclude: readonly string[];
  readonly accepts: Accepts | undefined;
  readonly sources: Sources;
};

export type ComparedRequest = {
  readonly root: string;
  readonly config: NitpickerConfig;
  readonly directory?: string | undefined;
  readonly resolvers: {
    readonly resolveHeadPolicy: (config: NitpickerConfig, projectRoot: string) => unknown;
    readonly resolveComparison: (
      repositoryRoot: string,
      baseRef: string,
    ) => { readonly mergeBaseSha: string };
  };
};

export type ComparedResult = { readonly conventions: unknown; readonly printed: string };
