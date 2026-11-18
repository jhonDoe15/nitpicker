import type { IniOptions } from '../ini-parser.mts';

export type OptionValue = string | string[];

export type RawOptions = Record<string, OptionValue>;

export type IniSource = {
  readonly file: string;
  readonly section: string | undefined;
  readonly always: boolean;
};

export type PytestConfig = {
  readonly pythonFiles: string[];
  readonly pythonClasses: string[];
  readonly pythonFunctions: string[];
  readonly norecursedirs: string[];
  readonly testpaths: string[];
  readonly xfailStrict: boolean;
  readonly djangoSettingsModule?: OptionValue;
  readonly addopts: string[];
};

export type CollectionOptions = {
  readonly pythonFiles: string[];
  readonly pythonClasses: string[];
  readonly pythonFunctions: string[];
  readonly norecursedirs: string[];
  readonly testpaths: string[];
  readonly deselected: string[];
  readonly ignored: string[];
  readonly ignoredGlobs: string[];
  readonly keywords: string[];
  readonly marks: string[];
};

export type TestFileOptions = CollectionOptions & { readonly django: boolean };

export type TestFileSettings = {
  readonly pythonFiles: readonly string[];
  readonly testpaths?: readonly string[];
  readonly django: boolean;
};

export type RootsEntry = {
  readonly type: 'roots';
  readonly key: string;
  readonly file: string;
  readonly label: string;
  readonly kind: string;
  readonly roots: readonly string[] | undefined;
  readonly contains: (file: string, root: string) => boolean;
  readonly applies: (file: string) => boolean;
};

export type ExcludesEntry = {
  readonly type: 'excludes';
  readonly key: string;
  readonly file: string;
  readonly label: string;
  readonly patterns: readonly string[];
  readonly covers: (file: string, pattern: string) => boolean;
};

export type SelectionEntry = RootsEntry | ExcludesEntry;

export type IniFile = Map<string, IniOptions>;

export type IniFileState = { options: IniOptions | undefined; current: string | undefined };
