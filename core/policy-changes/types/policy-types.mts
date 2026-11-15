import type { NitpickerConfig } from '../../../shared/values/config-types.mts';

export type ExceptionEntry = {
  readonly rule: string;
  readonly function?: string;
  readonly name?: string;
  readonly paths: readonly string[];
  readonly reason?: string;
};

export type LayoutConfig = {
  readonly sourceRoots?: readonly string[];
  readonly testRoots?: readonly string[];
  readonly excludedGlobs?: readonly string[];
  readonly entryPoints?: readonly string[];
  readonly sharedRoots?: readonly string[];
  readonly featureRoots?: readonly string[];
  readonly [field: string]: unknown;
};

export type TimeoutProject = { readonly language: string; readonly include: readonly string[] };

export type PolicyAnalyzer = { readonly name: string };

export type PolicyConfig = NitpickerConfig & { readonly layout?: LayoutConfig };

export type Loosening = {
  readonly text: string;
  readonly kind?: string | undefined;
  readonly key?: string;
  readonly files?: readonly string[];
  readonly blobs?: Readonly<Record<string, string>>;
  readonly evidence?: readonly (readonly string[])[];
};

export type ChangePart = {
  readonly loosened: readonly Loosening[];
  readonly changed: readonly string[];
};

export type FileChange = { readonly loosened?: Loosening; readonly changed?: string };

export type RootSets = Readonly<Record<string, readonly string[] | undefined>>;

type SourceEntry = { readonly key: string; readonly label: string; readonly file: string };

export type RootsSource = SourceEntry & {
  readonly type: 'roots';
  readonly set?: string;
  readonly kind?: string;
  readonly roots: readonly string[] | undefined;
  readonly contains?: (file: string, root: string) => boolean;
  readonly applies?: (file: string) => boolean;
};

export type ExcludesSource = SourceEntry & {
  readonly type: 'excludes';
  readonly patterns: readonly string[];
  readonly covers: (file: string, pattern: string) => boolean;
};

export type IncludesSource = SourceEntry & {
  readonly type: 'includes';
  readonly patterns: readonly string[];
  readonly admits: (file: string, pattern: string) => boolean;
  readonly inScope: (file: string) => boolean;
};

export type BuildSource = RootsSource | ExcludesSource | IncludesSource;

export type AppliedValues = {
  readonly base: Readonly<Record<string, unknown>>;
  readonly head: Readonly<Record<string, unknown>>;
  readonly file?: string | undefined;
  readonly files: readonly string[] | undefined;
  readonly precedence?: readonly string[] | undefined;
  readonly label?: string | undefined;
  readonly fileByKey?: Readonly<Record<string, string | undefined>> | undefined;
};

export type ProjectSide = {
  readonly config: PolicyConfig;
  readonly root: string;
  readonly files: readonly string[];
  readonly liveRoot: string;
};

export type OwnApplied = AppliedValues & { readonly file: string | undefined };

export type ImportLinterOptions = Readonly<Record<string, string | readonly string[] | undefined>>;

export type ImportLinterConfig = {
  readonly file: string;
  readonly session: ImportLinterOptions;
  readonly contracts: readonly { readonly id: string; readonly options: ImportLinterOptions }[];
};

export type ReplacedOptions =
  | { readonly rules: readonly string[]; readonly error?: undefined }
  | { readonly error: string; readonly rules?: undefined };

type ImportLinterEntry = {
  readonly tool: string;
  readonly importLinter: {
    readonly base: ImportLinterConfig | undefined;
    readonly head: ImportLinterConfig | undefined;
  };
};

export type ToolFileEntry = {
  readonly tool: string;
  readonly importLinter?: undefined;
  readonly base: ReadonlyMap<string, string>;
  readonly head: ReadonlyMap<string, string>;
  readonly optsIn: boolean;
  readonly evidence?: ReadonlyMap<string, string>;
  readonly applied?: AppliedValues;
  readonly replacedOptions?: ReplacedOptions;
};

export type ToolConfigEntry = ImportLinterEntry | ToolFileEntry;

export type GitBlobId = (content: string | Uint8Array) => string;

export type Fingerprints = ReadonlyMap<string, string>;

export type ToolFileCandidates = (side: ProjectSide) => readonly string[];

export type ToolConfigReaders = {
  readonly gitBlobId: GitBlobId;
  readonly replacedOptions?: ((config: PolicyConfig, root: string) => ReplacedOptions) | undefined;
};

export type PolicyScope = {
  readonly code: readonly string[];
  readonly keptCode: readonly string[];
  readonly keptPaths: readonly string[];
  readonly baseCode: readonly string[];
  readonly usesLayout: boolean;
  readonly baseRoots: RootSets;
  readonly headRoots: RootSets;
  readonly basePathOf: (file: string) => string;
  readonly existsInBase: (file: string) => boolean;
  readonly presetRequired: boolean;
  readonly sharedConfigs: readonly (readonly string[])[];
  readonly changedConfigLayers?: readonly string[];
  readonly repositoryLoosenings?: readonly Loosening[];
  readonly tsconfigs?:
    | {
        readonly base: ReadonlyMap<string, boolean>;
        readonly head: ReadonlyMap<string, boolean>;
      }
    | undefined;
  readonly buildSources?:
    | {
        readonly base: readonly BuildSource[];
        readonly head: readonly BuildSource[];
      }
    | undefined;
  readonly toolConfigs: readonly ToolConfigEntry[];
  readonly productionReach: () => ReadonlyMap<string, string>;
  readonly importedBy: (candidates: readonly string[]) => readonly string[];
  readonly blobOf: (file: string) => string;
  readonly generated: {
    readonly base: (file: string) => boolean;
    readonly head: (file: string) => boolean;
  };
};

export type SettingValues = { readonly before?: unknown; readonly after?: unknown };

export type SettingChange = SettingValues & { readonly setting: string };

export type ScopedChange = SettingChange & { readonly scope: PolicyScope };

export type Thresholds = Readonly<Record<string, number>>;

export type ListedConfig = {
  readonly disable?: readonly string[];
  readonly thresholds?: Readonly<Record<string, unknown>>;
  readonly analyzers?: readonly PolicyAnalyzer[];
};

export type SettingRule = readonly [RegExp, string, (change: ScopedChange) => boolean];

export type AppliedSide =
  | {
      readonly kind: 'applied';
      readonly config: Readonly<Record<string, unknown>>;
      readonly file?: string | undefined;
      readonly files?: readonly string[] | undefined;
      readonly fileByKey?: Readonly<Record<string, string | undefined>> | undefined;
    }
  | { readonly kind: 'rejected' };

export type ImportedProject = {
  readonly projectRoot: string;
  readonly config: PolicyConfig;
  readonly files: readonly string[];
  readonly roots: RootSets;
};

export type ScopeInputs = {
  readonly files: readonly string[];
  readonly baseFiles?: readonly string[];
  readonly baseRoots: RootSets;
  readonly headRoots: RootSets;
  readonly headConfig: PolicyConfig;
  readonly moves?:
    | {
        readonly files?: ReadonlyMap<string, string>;
        readonly directories?: ReadonlyMap<string, string>;
      }
    | undefined;
  readonly presetRequired?: true | undefined;
  readonly configLayers?: {
    readonly shared: readonly (readonly string[])[];
    readonly changed: readonly string[];
  };
  readonly tsconfigs?: PolicyScope['tsconfigs'];
  readonly buildSources?: PolicyScope['buildSources'];
  readonly toolConfigs?: readonly ToolConfigEntry[];
  readonly reach?: () => ReadonlyMap<string, string>;
  readonly importedBy?: (candidates: readonly string[]) => readonly string[];
  readonly blobOf?: (file: string) => string;
  readonly generated?: PolicyScope['generated'];
};

export type PolicyRead = {
  readonly baseConfig: PolicyConfig;
  readonly headConfig: PolicyConfig;
  readonly baseProjectRoot: string;
  readonly headProjectRoot: string;
  readonly liveProjectRoot?: string;
  readonly moves?: ScopeInputs['moves'];
  readonly inherits?: string | undefined;
  readonly replacedOptions?: ((config: PolicyConfig, root: string) => ReplacedOptions) | undefined;
};

export type Side = {
  readonly projectRoot: string;
  readonly files: readonly string[];
  readonly roots: RootSets;
};
