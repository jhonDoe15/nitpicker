export type Tree = ReadonlyMap<string, string>;

export type TreeLike = Tree | Readonly<Record<string, string>>;

export type Shortcut = {
  category: string;
  kind: string;
  path?: string;
  line?: number;
  detail?: string;
  rename?: { type: string; from: string; to: string };
  confidence?: string;
};

export type Occurrence = {
  kind: string;
  key: string;
  line: number;
  detail: string;
};

export type Language = 'python' | 'java' | 'kotlin';

export type Family = 'python' | 'jvm';

export type JvmLanguage = 'java' | 'kotlin';

export type TestFamily = 'jupiter' | 'junit4' | 'other';

export type ParsedTest = {
  key: string;
  line: number;
  shape: string;
  source: string;
  assertions: number;
  tautologies: string[];
  weak: string[];
  skipped: boolean;
  rows: number | undefined;
  collected: boolean;
  family?: TestFamily;
};

export type TypeScope = { name: string; open: number; close: number; header: string };

export type MaskedViews = { masked: string; kept: string };
