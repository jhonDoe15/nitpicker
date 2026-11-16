import type * as Prettier from 'prettier';
import type { ChoiceConvention } from '../../../../shared/values/config-types.mts';
import { layeredPrettierOptions as untypedLayeredPrettierOptions } from '../../adapters/prettier/prettier-layers.mts';
import { fileNameComplies as untypedFileNameComplies } from '../file-name-casing.mjs';
import {
  prettierConventionOptions as untypedPrettierConventionOptions,
  PRETTIER_CONVENTIONS as UNTYPED_PRETTIER_CONVENTIONS,
} from '../prettier-conventions.mjs';
import {
  conventionChoices as untypedConventionChoices,
  detectConventions as untypedDetectConventions,
} from '../../../../shared/conventions/detect.mjs';

export type ConventionDefinition = {
  readonly id: string;
  measure?(text: string | undefined, file?: string): unknown;
};

export type Detected = {
  readonly choice: unknown;
  readonly source: string;
  readonly counts: Readonly<Record<string, number>>;
  readonly files: number | undefined;
};

type ConventionSource = {
  readonly paths: (options: { readonly unreadable?: true }) => readonly string[];
  readonly readMany: (paths: readonly string[]) => ReadonlyMap<string, string | undefined>;
};

export type DetectRequest = {
  readonly definitions: readonly ConventionDefinition[];
  readonly source: ConventionSource;
  readonly pinned?: Readonly<Record<string, unknown>>;
  readonly accepts?: (...args: never[]) => boolean;
};

const detectConventions: (request: DetectRequest) => Readonly<Record<string, Detected>> =
  untypedDetectConventions;

export const conventionChoices: (
  detected: Readonly<Record<string, Detected>>,
  definitions: readonly (ConventionDefinition & { readonly fallback?: unknown })[],
) => Readonly<Record<string, unknown>> = untypedConventionChoices;

export function detectedFor(request: DetectRequest, id: string): Detected {
  const detected = detectConventions(request)[id];
  if (detected === undefined) {
    throw new Error(`No detection for ${id}`);
  }
  return detected;
}

export function measureOf(
  definitions: readonly ConventionDefinition[],
  id: string,
): (text: string | undefined, file?: string) => unknown {
  const definition = definitions.find((found) => found.id === id);
  if (definition?.measure === undefined) {
    throw new Error(`No convention ${id}`);
  }
  return (text, file) => definition.measure?.(text, file);
}

export const layeredPrettierOptions: (
  prettier: typeof Prettier,
  settings: {
    readonly precedence: readonly string[];
    readonly policyOptions: Prettier.Options;
    readonly liveProjectRoot: string;
    readonly relativePath: string;
  },
) => Promise<Prettier.Options> = untypedLayeredPrettierOptions;

export const fileNameComplies: (file: string, casing: string, text: string | undefined) => boolean =
  untypedFileNameComplies;

export const prettierConventionOptions: (
  conventions: Readonly<Record<string, string>>,
) => Prettier.Options = untypedPrettierConventionOptions;

export const PRETTIER_CONVENTIONS: readonly (ConventionDefinition & ChoiceConvention)[] =
  UNTYPED_PRETTIER_CONVENTIONS;
