import type * as Prettier from 'prettier';
import {
  isIgnoredByLayers as isIgnoredByUntypedLayers,
  layeredPrettierOptions as untypedLayeredPrettierOptions,
} from '../prettier/prettier-layers.mjs';

export type PrettierLayers = {
  readonly precedence: readonly string[];
  readonly policyIgnorePath: string;
  readonly projectRoot: string;
  readonly liveProjectRoot: string;
  readonly relativePath: string;
};

export const isIgnoredByLayers: (
  prettier: typeof Prettier,
  layers: PrettierLayers,
) => Promise<boolean> = isIgnoredByUntypedLayers;

export const layeredPrettierOptions: (
  prettier: typeof Prettier,
  layers: PrettierLayers & { readonly policyOptions: Prettier.Options },
) => Promise<Prettier.Options> = untypedLayeredPrettierOptions;

export function prettierOptionsOf(value: unknown): Prettier.Options {
  return typeof value === 'object' && value !== null ? value : {};
}

function isPrettierApi(value: unknown): value is typeof Prettier {
  return (
    typeof value === 'object' &&
    value !== null &&
    'format' in value &&
    typeof value.format === 'function' &&
    'getFileInfo' in value &&
    typeof value.getFileInfo === 'function'
  );
}

export async function importPrettier(url: string): Promise<typeof Prettier> {
  const loaded: unknown = await import(url);
  if (!isPrettierApi(loaded)) {
    throw new TypeError(`${url} is not the Prettier API`);
  }
  return loaded;
}
