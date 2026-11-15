import {
  conventionChoices as untypedConventionChoices,
  detectConventions as untypedDetectConventions,
} from '../../../shared/conventions/detect.mjs';
import {
  describeConventions as untypedDescribeConventions,
  ignoredChoiceNote as untypedIgnoredChoiceNote,
  isValidChoice as untypedIsValidChoice,
} from '../../../shared/conventions/settings.mjs';
import { isJavascriptPolicy as untypedIsJavascriptPolicy } from '../../../languages/javascript/preset/javascript-preset.mjs';
import {
  builtInExcludedGlobs as untypedBuiltInExcludedGlobs,
  prettierPatterns as untypedPrettierPatterns,
  resolveLayout as untypedResolveLayout,
} from '../../../languages/typescript/preset/layout.mjs';
import { globMatcher as untypedGlobMatcher } from '../../../shared/paths/glob.mjs';
import { textsOf } from '../../../shared/values/readers.mts';
import type { NitpickerConfig } from '../../../shared/values/config-types.mts';
import type {
  ConventionDefinition,
  ConventionSource,
  DetectedConventions,
  GlobMatcher,
  ResolvedLayout,
} from './convention-types.mts';

type LayoutResolver = (
  layout: object | undefined,
  exclude: string[] | undefined,
  options: object,
) => ResolvedLayout;

type DetectRequest = {
  readonly definitions: readonly ConventionDefinition[];
  readonly source: ConventionSource | undefined;
  readonly pinned: Readonly<Record<string, unknown>>;
  readonly exclude: readonly string[];
  readonly accepts?: ((definition: ConventionDefinition, file: string) => boolean) | undefined;
};

type DescribeNote = (id: string, choice: unknown) => string | undefined;

function applyUntyped(fn: (...args: never[]) => unknown, args: readonly unknown[]): unknown {
  return Reflect.apply(fn, undefined, args);
}

function isDetected(value: unknown): value is DetectedConventions {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.values(value).every((entry) => typeof entry === 'object' && entry !== null)
  );
}

export const conventionChoices: (
  detected: DetectedConventions,
  definitions: readonly ConventionDefinition[],
) => Record<string, unknown> = untypedConventionChoices;

export function detectConventions(request: DetectRequest): DetectedConventions {
  const detected = applyUntyped(untypedDetectConventions, [request]);
  if (!isDetected(detected)) {
    throw new TypeError('detectConventions returned no conventions');
  }
  return detected;
}

export function describeConventions(
  detected: DetectedConventions,
  definitions: readonly ConventionDefinition[],
  note: DescribeNote,
): string[] {
  return textsOf(applyUntyped(untypedDescribeConventions, [detected, definitions, note]));
}

export const ignoredChoiceNote: (
  definition: ConventionDefinition,
  entry: { readonly choice: string; readonly from: string },
) => string = untypedIgnoredChoiceNote;

export const isValidChoice: (
  definition: ConventionDefinition | undefined,
  choice: unknown,
) => boolean = untypedIsValidChoice;

export const isJavascriptPolicy: (policy: NitpickerConfig) => boolean = untypedIsJavascriptPolicy;

export const builtInExcludedGlobs: readonly string[] = untypedBuiltInExcludedGlobs;

export const prettierPatterns: (layout: ResolvedLayout) => string[] = untypedPrettierPatterns;

export const resolveLayout: LayoutResolver = untypedResolveLayout;

export const globMatcher: (glob: string) => GlobMatcher = untypedGlobMatcher;
