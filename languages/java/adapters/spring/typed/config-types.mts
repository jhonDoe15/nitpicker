export type ConfigEntry = {
  readonly key: string;
  readonly value: string;
  readonly line: number;
  readonly list: boolean;
};

export type EntryDocument = { readonly entries: ConfigEntry[] };

export type PairSplit = { readonly key: string; readonly value: string };

export type YamlRow = { readonly content: string; readonly indent: number; readonly line: number };

export type YamlParent = { readonly indent: number; readonly key: string };

export type YamlState = {
  entries: ConfigEntry[];
  stack: YamlParent[];
  listIndent: number | undefined;
  blockIndent: number | undefined;
  pending: string;
};

export type PropertiesState = {
  documents: ConfigEntry[][];
  parts: string[];
  line: number;
};

export type ScalarRead = {
  readonly key: string;
  readonly value: string;
  readonly indent: number;
  readonly line: number;
};

export type SpringDocument = {
  readonly path: string;
  readonly main: boolean;
  readonly fileProfile: string | undefined;
  readonly profiles: string[];
  readonly negated: boolean;
  readonly entries: ConfigEntry[];
};

export type ProfiledDocument = SpringDocument & {
  readonly testOnly: boolean;
  readonly testOrLocalOnly: boolean;
};

export type ProfileKinds = {
  readonly detected: ReadonlySet<string>;
  readonly mainFiles: ReadonlySet<string>;
};

export type Attempt<T> = { readonly ok: true; readonly value: T } | { readonly ok: false };

export type ConfigRule = {
  readonly rule: string;
  readonly exempt: (document: ProfiledDocument) => boolean;
  readonly lists?: true;
  readonly problem: (entry: ConfigEntry, key: string) => string | undefined;
};

export type ConfigSite = { readonly document: ProfiledDocument; readonly entry: ConfigEntry };

export type ErrorDetail = {
  readonly key: string;
  readonly sensitive: (value: string) => boolean;
  readonly message: string;
};
