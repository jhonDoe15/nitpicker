import type { ConfigEntry, ConfigSite, ProfiledDocument } from './config-types.mts';

export type SpringProblem = {
  readonly path: string;
  readonly line: number;
  readonly key: string;
  readonly message: string;
};

export type SpringConfigOptions = {
  readonly sourceRoots?: readonly string[];
  readonly resourceRoots?: unknown;
  readonly testSourceRoots?: readonly string[];
  readonly kotlinTestSourceRoots?: readonly string[];
  readonly springClasspath?: readonly string[];
  readonly baselineRoot?: string;
};

export type SpringFinding = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly identity: string;
  readonly message: string;
  readonly allowedForm: string;
  readonly classification: string;
  readonly location?: { readonly line: number };
};

export type Occurrences = Map<string, number>;

export type FindingSpec = {
  readonly rule: string;
  readonly document: { readonly path: string };
  readonly entry?: { readonly line: number };
  readonly key: string;
  readonly message: string;
  readonly occurrences: Occurrences;
};

export type UnboundContext = {
  readonly sourceRoots: readonly string[];
  readonly resources: readonly string[];
  readonly options: SpringConfigOptions;
  readonly occurrences: Occurrences;
};

export type DocumentContext = {
  readonly projectRoot: string;
  readonly sourceRoots: readonly string[];
  readonly documents: readonly ProfiledDocument[];
  readonly occurrences: Occurrences;
};

export type FlaggedEntry = ConfigSite & { readonly message: string };

export type MaybeFlagged = ConfigSite & { readonly message: string | undefined };

export type OpenInView = {
  readonly enabled: ConfigSite[];
  readonly missingIn: ProfiledDocument | undefined;
};

export type LineKey = Pick<ConfigEntry, 'key' | 'line'>;
