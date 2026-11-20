import type { Linter } from 'eslint';
import type { Layout } from '../../../adapters/typed/head-policy.mts';
import type { ExceptionRule } from '../../eslint-config/exceptions.mts';
import type { LayoutTestFiles } from '../../layout/layout-types.mts';

export type Entry = Linter.Config;

export type StrictOptions = {
  readonly react: boolean;
  readonly nest: boolean;
  readonly routeHandlers: boolean;
  readonly security: SecurityFacts;
  readonly frameworkDefaultExports: readonly string[];
  readonly detachedWorkRunners: readonly string[];
  readonly databaseWrites: {
    readonly orms: readonly string[];
    readonly opensTransactions: boolean;
  };
  readonly routeAuth: { readonly entries: readonly string[] };
  readonly softDeleteFilters: {
    readonly orms: readonly string[];
    readonly filters: readonly string[];
  };
};

export type PresetLayout = Layout & {
  readonly runnableTestGlobs: readonly string[];
  readonly testGlobs: readonly string[];
  readonly unitTestGlobs: readonly string[];
  readonly endToEndGlobs: readonly string[];
  readonly typescriptProject?: string | undefined;
  readonly testFiles: LayoutTestFiles;
};

export type ParserOptions = {
  readonly project: string;
  readonly tsconfigRootDir: string;
};

export type SecurityFacts = { readonly browser: boolean };

export type PresetPolicy = {
  readonly react: Readonly<Record<string, unknown>>;
  readonly i18n: Readonly<Record<string, unknown>>;
  readonly conventions: Readonly<Record<string, unknown>>;
  readonly conventionPins: Readonly<Record<string, unknown>>;
  readonly frameworks: { readonly defaultExports: readonly string[] };
  readonly exceptions: readonly ExceptionRule[];
  readonly tools: { readonly eslint?: { readonly precedence?: string[] } | undefined };
};
