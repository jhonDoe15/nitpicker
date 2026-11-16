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

type ConventionBase = {
  readonly id: string;
  readonly label: string;
  readonly files: readonly string[];
  readonly scope?: string;
};

type NamesConvention = ConventionBase & {
  readonly kind: string;
  readonly namesMeaning?: string;
  readonly options?: undefined;
};

export type ChoiceConvention = ConventionBase & {
  readonly kind?: undefined;
  readonly options: readonly string[];
  readonly optionLabels?: Readonly<Record<string, string>>;
  readonly unit?: string;
  readonly range?: string;
  readonly valuePattern?: RegExp;
};

export type ConventionDefinition = NamesConvention | ChoiceConvention;
