export type PresetValues<Value> = Readonly<Record<string, Value>>;

export type ExceptionRoute = {
  readonly key?: string;
  readonly rule?: string | undefined;
  readonly presetKeys?: PresetValues<string>;
  readonly presetRules?: PresetValues<string>;
  readonly presetNotes?: PresetValues<string>;
  readonly note?: string;
  readonly function?: unknown;
  readonly functionRequired?: unknown;
  readonly name?: unknown;
  readonly packages?: unknown;
};

export type DocsLink = {
  readonly label: string;
  readonly path: string;
  readonly anchor?: string | undefined;
};

export type OutsideLink = { readonly label: string; readonly url: string };

export type LinkTarget = {
  readonly path?: string | undefined;
  readonly anchor?: string | undefined;
  readonly url?: string | undefined;
};

export type AllowedForm = { readonly label?: string | undefined; readonly message: string };

type CodeExample = { readonly code: string; readonly language: string };

export type EntryFields = {
  readonly tool: string;
  readonly rule: string;
  readonly summary: string;
  readonly analyzers: PresetValues<readonly string[] | undefined>;
  readonly exception: ExceptionRoute;
  readonly page?: string | undefined;
  readonly findingTools?: readonly string[];
  readonly labels?: readonly string[];
  readonly tier?: string;
  readonly pattern?: string;
  readonly barePattern?: true;
  readonly samples?: readonly string[];
  readonly builds?: PresetValues<readonly string[]>;
  readonly scope?: string;
  readonly why?: string | undefined;
  readonly allowed?: string | undefined;
  readonly fix?: PresetValues<string>;
  readonly example?: CodeExample;
  readonly limit?: string | undefined;
  readonly forms?: readonly AllowedForm[];
  readonly docs?: readonly DocsLink[];
  readonly links?: readonly OutsideLink[];
  readonly messageIn?: PresetValues<string>;
  readonly allowedIn?: PresetValues<string>;
};

export type RuleEntry = EntryFields & { readonly id: string; readonly anchor: string };

export type PageDescription = {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly guide: string;
};

export type EntryIndex = {
  readonly entries: readonly RuleEntry[];
  readonly exact: ReadonlyMap<string, readonly RuleEntry[]>;
  readonly lowercase: ReadonlyMap<string, readonly RuleEntry[]>;
  readonly patterns: readonly { readonly entry: RuleEntry; readonly expression: RegExp }[];
};

export type ReferenceLinks = {
  index(): EntryIndex;
  root(): string | undefined;
};

export type FactLine = {
  readonly label: string;
  readonly text?: string;
  readonly items?: readonly string[];
  readonly code?: string;
  readonly language?: string;
};

export type EntryDefaults = Omit<EntryFields, 'rule' | 'summary' | 'exception' | 'allowed'> & {
  readonly exceptionKey?: string | undefined;
  readonly exceptionRule?: ((rule: string) => string) | undefined;
};

export type EntryRow = readonly [
  rule: string,
  summary: string,
  allowed?: string | undefined,
  extra?: Partial<EntryFields>,
];

export type EncodedPage = {
  readonly fields: readonly string[];
  readonly values: readonly unknown[];
  readonly entries: readonly (readonly number[])[];
};

export type StoredEntry = RuleEntry & { readonly page: string };

export type FindingKey = { readonly tool: string; readonly rule: string };

export type HelpedFinding = FindingKey & { readonly helpUri?: string | undefined };

export type RuleNote = readonly [
  summary: string,
  why: string,
  allowed: string | undefined,
  ...more: string[],
];

export type CounterpartPage = {
  readonly label: string;
  readonly path: string;
  readonly tool?: string;
  readonly anchor?: string;
  readonly prefix?: string;
};
export type PageKey = 'java' | 'jvm' | 'typescript' | 'spring' | 'python' | 'go';
export type Group = Readonly<Partial<Record<PageKey, string>>>;

export type CounterpartEntry = readonly [string, readonly DocsLink[]];
