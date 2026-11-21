import type * as Prettier from 'prettier';
import type { ChoiceConvention } from '../../../../shared/values/config-types.mts';
import { layeredPrettierOptions as untypedLayeredPrettierOptions } from '../../adapters/prettier/prettier-layers.mts';
import { fileNameComplies as untypedFileNameComplies } from '../file-name-casing.mts';
import {
  prettierConventionOptions as untypedPrettierConventionOptions,
  PRETTIER_CONVENTIONS as UNTYPED_PRETTIER_CONVENTIONS,
} from '../prettier-conventions.mts';
import { detectConventions } from '../../../../shared/conventions/detect.mts';
import type {
  Convention,
  DetectedEntry,
} from '../../../../shared/conventions/convention-types.mts';

export function detectedFor(
  request: Parameters<typeof detectConventions>[0],
  id: string,
): DetectedEntry {
  const detected = detectConventions(request)[id];
  if (detected === undefined) {
    throw new Error(`No detection for ${id}`);
  }
  return detected;
}

export function measureOf(
  definitions: readonly Convention[],
  id: string,
): (text: string | undefined, file?: string) => unknown {
  const definition = definitions.find((found) => found.id === id);
  if (definition?.measure === undefined) {
    throw new Error(`No convention ${id}`);
  }
  return (text, file = '') => definition.measure?.(text, file);
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

export const PRETTIER_CONVENTIONS: readonly (Convention & ChoiceConvention)[] =
  UNTYPED_PRETTIER_CONVENTIONS;
