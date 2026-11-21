export type FormatCheckOptions = {
  readonly tool?: string | undefined;
  readonly message?: string | undefined;
  readonly root?: string | undefined;
};

export type StructureEntry = {
  readonly name: string;
  readonly file: string;
  readonly start: number;
  readonly end: number;
  readonly signature?: string | undefined;
  readonly numberedAmongSameSource?: unknown;
  readonly [field: string]: unknown;
};

export type SourceCache = Map<string, string[]>;

export type SourceRange = { readonly file: string; readonly start: number; readonly end: number };

export type StructureOptions = {
  readonly hints?: Readonly<Record<string, string | undefined>> | undefined;
  readonly numberedAmongSameSource?: unknown;
  readonly textOf?: (sources: SourceCache, projectRoot: string, entry: StructureEntry) => string;
};

export type UnitName = 'ascii-only' | 'code-points' | 'tab-stops' | 'checkstyle-tab-stops';

export type UnitSpec = { readonly unit: UnitName; readonly tabWidth?: number | undefined };

export type ColumnLocation = {
  readonly line?: number | undefined;
  readonly column?: number | undefined;
  readonly [field: string]: unknown;
};

export type ColumnFinding = {
  readonly tool: string;
  readonly path: string;
  readonly location?: ColumnLocation | undefined;
};

export type ColumnSettings = {
  readonly units: Readonly<Record<string, UnitName | UnitSpec | undefined>>;
  readonly readSource: (file: string) => string | undefined;
};
