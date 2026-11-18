import { namesOf as untypedNamesOf } from './source/jvm-tokens.mjs';
import { readJvmDefinitions as untypedReadJvmDefinitions } from './source/jvm-definitions.mjs';
import type { JavaFinding } from '../typed/java-values.mts';

export type Token = {
  readonly text: string;
  readonly kind: string;
  readonly line?: number;
  readonly names?: readonly string[];
};

export type Definition = {
  readonly name: string;
  readonly kind: string;
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly tokens: readonly string[];
  readonly owner?: string | undefined;
  readonly supertypes?: string | undefined;
  readonly qualifier?: string | undefined;
  readonly literal?: true | false;
  readonly entry?: true | false;
  readonly [field: string]: unknown;
};

export type ImportEntry = {
  readonly path: string;
  readonly alias?: string | undefined;
  readonly wildcard: boolean;
  readonly static: boolean;
};

export type Parsed = {
  readonly packageName: string;
  readonly imports: readonly ImportEntry[];
  readonly tokens: readonly Token[];
  readonly headerEnd: number;
  readonly declaredTypes: Set<string>;
  readonly memberNames: Set<string>;
  readonly definitions: readonly Definition[];
};

export type Entry = { readonly file: string; readonly module: string; readonly parsed: Parsed };

export type Target = {
  readonly file: string;
  readonly name: string;
  readonly alias?: string | undefined;
  readonly type?: true | false;
  readonly module?: string;
};

export type Bindings = Map<string, Target[]>;

export type ProjectIndex = {
  readonly types: Map<string, { file: string; module: string }[]>;
  readonly packages: Map<string, Map<string, Target[]>>;
  readonly members: Set<string>;
};

export type Scope = {
  readonly file: string;
  readonly byName: Map<string, Definition[]>;
  readonly external: Map<string, string>;
  readonly stars: string | undefined;
  readonly declaredTypes: Set<string>;
  readonly memberNames: Set<string>;
};

export type BoundEntry = Entry & { readonly bindings: Bindings; readonly scope: Scope };

export type Reexport = {
  readonly from: string;
  readonly to: string;
  readonly names: readonly { readonly name: string; readonly alias?: string | undefined }[];
  readonly reexport?: true;
};

export type ReuseFacts = {
  readonly modules: {
    readonly file: string;
    readonly role: string;
    readonly entry?: true;
    readonly publicNames?: string[];
    readonly entryName?: string;
  }[];
  readonly packages: { readonly root: string; readonly published: boolean }[];
  readonly definitions: {
    readonly file: string;
    readonly key: string;
    readonly [field: string]: unknown;
  }[];
  readonly imports: readonly unknown[];
  readonly nearDuplicateUnits: readonly unknown[];
};

export type ReusePart = {
  readonly findings: readonly JavaFinding[];
  readonly entryFindings: readonly JavaFinding[];
  readonly usage: {
    readonly modules: readonly unknown[];
    readonly packages: readonly unknown[];
    readonly imports: readonly unknown[];
  };
};

export const namesOf: (token: Token) => string[] = untypedNamesOf;
export const readJvmDefinitions: (
  source: string,
  options?: { kotlin?: true | false; nested?: true | false },
) => Parsed = untypedReadJvmDefinitions;
