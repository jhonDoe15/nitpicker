export type CustomAnalyzerEntry = {
  readonly name: string;
  readonly command?: string;
  readonly args?: readonly string[];
};

type ExceptionConfig = {
  readonly rule: string;
  readonly function?: string;
  readonly name?: string;
  readonly paths: readonly string[];
  readonly reason?: string;
};

type ToolSetting = {
  readonly runner?: string;
  readonly precedence?: string[];
  readonly timeouts?: { readonly [field: string]: unknown };
  readonly [field: string]: unknown;
};

export type NitpickerConfig = {
  readonly preset?: string | undefined;
  readonly base?: string;
  readonly analyzers?: readonly CustomAnalyzerEntry[];
  readonly disable?: readonly string[];
  readonly exceptions?: readonly ExceptionConfig[];
  readonly thresholds?: Readonly<Record<string, number>>;
  readonly exclude?: readonly string[];
  readonly layout?: { readonly sourceRoots?: readonly string[]; readonly [key: string]: unknown };
  readonly analyzerTimeoutMinutes?: unknown;
  readonly legacyInventory?: string;
  readonly duplicates?: {
    readonly skippedFolders?: readonly string[];
    readonly [key: string]: unknown;
  };
  readonly kotlin?: { readonly detektConfig?: string; readonly [field: string]: unknown };
  readonly java?: object;
  readonly testConsole?: unknown;
  readonly conventions?: Readonly<Record<string, unknown>>;
  readonly react?: unknown;
  readonly i18n?: unknown;
  readonly protocols?: unknown;
  readonly history?: { readonly coChange?: unknown; readonly [key: string]: unknown };
  readonly tools?: {
    readonly tests?: ToolSetting;
    readonly [tool: string]: ToolSetting | undefined;
  };
  readonly python?: {
    readonly sourceRoots?: readonly string[];
    readonly exceptions?: readonly ExceptionConfig[];
    readonly entryPoints?: readonly string[];
    readonly importLinter?: unknown;
    readonly [field: string]: unknown;
  };
  readonly go?: { readonly [key: string]: unknown };
  readonly [field: string]: unknown;
};

export type ConventionDefinition = {
  readonly id: string;
  readonly kind?: string;
  readonly label: string;
  readonly options: readonly string[];
  readonly optionLabels?: Readonly<Record<string, string>>;
  readonly unit?: string;
  readonly range?: string;
  readonly valuePattern?: RegExp;
  readonly namesMeaning?: string;
  readonly files: readonly string[];
  readonly scope?: string;
};

export type ConfigLayer = {
  readonly file: string;
  readonly label: string;
  readonly config: unknown;
};

export type ConfigSettings = Readonly<Record<string, unknown>>;

export type ProjectOverlay = {
  readonly preset?: string;
  readonly companion?: true;
  readonly settings?: object;
  readonly declared?: true;
  readonly exclude?: readonly string[];
  readonly inherits?: string;
};
