import {
  builtInExcludedGlobs as untypedBuiltInExcludedGlobs,
  defaultResolvedLayout as untypedDefaultResolvedLayout,
} from '../../../languages/typescript/preset/layout.mts';
import { canonicalRule as untypedCanonicalRule } from '../../../shared/exceptions/rule-names.mjs';
import { sameJson as untypedSameJson } from '../../../shared/config.mjs';
import {
  DEFAULT_CRAP_SCORE_LIMIT as UNTYPED_DEFAULT_CRAP_SCORE_LIMIT,
  FILE_LIMIT_DEFAULTS as UNTYPED_FILE_LIMIT_DEFAULTS,
  TEST_TIME_DEFAULTS as UNTYPED_TEST_TIME_DEFAULTS,
} from '../../../shared/policy.mjs';
import { fieldOf } from '../../../shared/values/readers.mts';
import type { NitpickerConfig } from '../../../shared/values/config-types.mts';

export type ExceptionEntry = {
  readonly rule: string;
  readonly function?: string;
  readonly name?: string;
  readonly paths: readonly string[];
  readonly reason?: string;
};

export type LayoutConfig = {
  readonly sourceRoots?: readonly string[];
  readonly testRoots?: readonly string[];
  readonly excludedGlobs?: readonly string[];
  readonly entryPoints?: readonly string[];
  readonly [field: string]: unknown;
};

export type BaseConfig = NitpickerConfig & { readonly layout?: LayoutConfig };

type DefaultLayout = {
  readonly sourceRoots: readonly string[];
  readonly testRoots: readonly string[];
  readonly executedTestRoots: readonly string[];
};

const defaultResolvedLayout: DefaultLayout = untypedDefaultResolvedLayout;

export const sourceRoots = defaultResolvedLayout.sourceRoots;
export const testRoots = defaultResolvedLayout.testRoots;
export const executedTestRoots = defaultResolvedLayout.executedTestRoots;
export const builtInExcludedGlobs: readonly string[] = untypedBuiltInExcludedGlobs;
export const canonicalRule: (rule: string) => string = untypedCanonicalRule;
export const sameJson: (left: unknown, right: unknown) => boolean = untypedSameJson;

export const THRESHOLD_DEFAULTS: Readonly<Record<string, number>> = {
  crapLimit: UNTYPED_DEFAULT_CRAP_SCORE_LIMIT,
  ...UNTYPED_FILE_LIMIT_DEFAULTS,
  ...UNTYPED_TEST_TIME_DEFAULTS,
};

function isExceptionEntry(value: unknown): value is ExceptionEntry {
  return typeof fieldOf(value, 'rule') === 'string' && Array.isArray(fieldOf(value, 'paths'));
}

export function exceptionEntries(
  list: readonly unknown[] | undefined,
): readonly ExceptionEntry[] | undefined {
  return list?.filter(isExceptionEntry);
}

export function thresholdsOf(
  thresholds: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, number>> | undefined {
  return thresholds === undefined
    ? undefined
    : Object.fromEntries(
        Object.entries(thresholds).flatMap(([key, value]) =>
          typeof value === 'number' ? [[key, value]] : [],
        ),
      );
}
