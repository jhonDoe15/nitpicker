import type { TSESLint } from '@typescript-eslint/utils';
import type { SourceCode } from '../../eslint-plugin/rules/typed/node-views.mts';

export type { SourceCode };
export type Definition = TSESLint.Scope.Definition;

export type LibraryIds = { readonly validation: string[]; readonly logger: string[] };
export type ManifestLibraries = {
  readonly production: LibraryIds;
  readonly development: LibraryIds;
};
export type DetectedLibraries = LibraryIds & {
  readonly packages: Readonly<Record<string, ManifestLibraries>>;
};
export type ProjectLibraries = LibraryIds & {
  readonly packages?: Readonly<Record<string, ManifestLibraries>>;
};

export type ValidationLibrary = {
  readonly id: string;
  readonly packages: readonly string[];
  readonly phrase: string;
  readonly call: string;
  readonly example: string;
  readonly anyReceiver: readonly string[];
  readonly derivedReceiver: readonly string[];
  readonly namespace: readonly string[];
  readonly imported: readonly string[];
  readonly transform: readonly string[];
  readonly factories: readonly string[];
  readonly callable: boolean;
};

export type ValidationSpec = Pick<
  ValidationLibrary,
  'id' | 'packages' | 'phrase' | 'call' | 'example'
> &
  Partial<ValidationLibrary>;

export type LoggerLibrary = {
  readonly id: string;
  readonly packages: readonly string[];
  readonly shape: string;
};

export type ValidationBehavior = {
  readonly name: string;
  readonly phrase: string;
  readonly call: string;
  readonly example: string;
  readonly accepted: readonly ValidationLibrary[];
};

export type LibraryBinding = { readonly source: unknown; readonly name: string | undefined };

export type SchemaContext = {
  readonly sourceCode: SourceCode;
  readonly services: SourceCode['parserServices'];
};

export type FileLibraryContext = { readonly filename?: string; readonly cwd?: string };
