import { readFileSync } from 'node:fs';
import type * as prettier from 'prettier';
import { prettierPrecedence as untypedPrecedence } from '../../languages/typescript/preset/head-policy.mjs';
import {
  isIgnoredByLayers as untypedIsIgnoredByLayers,
  layeredPrettierOptions as untypedLayeredOptions,
} from '../../languages/typescript/adapters/prettier/prettier-layers.mjs';
import { fieldOf, fieldsOf, listOf, parseJson, textOf } from '../../shared/values/readers.mts';

export type PolicyOptions = Readonly<Record<string, unknown>>;

export type SourceFile = {
  readonly path: string;
  readonly filePath: string;
  readonly source: string;
};

export type Input = {
  readonly layered: boolean;
  readonly projectRoot: string;
  readonly files: readonly SourceFile[];
};

export type Layers = {
  readonly precedence: unknown;
  readonly policyOptions: PolicyOptions;
  readonly policyIgnorePath: string | undefined;
  readonly projectRoot: string;
  readonly liveProjectRoot: string;
};

type LayerRequest = Layers & { readonly relativePath: string };

export const isIgnoredByLayers: (
  prettierModule: typeof prettier,
  layers: LayerRequest,
) => Promise<boolean> = untypedIsIgnoredByLayers;

export const layeredPrettierOptions: (
  prettierModule: typeof prettier,
  layers: LayerRequest,
) => Promise<PolicyOptions> = untypedLayeredOptions;

function readPolicy(file: string | undefined): string {
  return readFileSync(file ?? '', 'utf8');
}

export function inputOf(text: string): Input {
  const value = parseJson(text);
  return {
    layered: fieldOf(value, 'layered') === true,
    projectRoot: textOf(fieldOf(value, 'projectRoot')),
    files: listOf(fieldOf(value, 'files')).map((file) => ({
      path: textOf(fieldOf(file, 'path')),
      filePath: textOf(fieldOf(file, 'filePath')),
      source: textOf(fieldOf(file, 'source')),
    })),
  };
}

export function layersOf(input: Input, argv: readonly string[]): Layers {
  const prettierPrecedence: () => unknown = untypedPrecedence;
  return {
    precedence: prettierPrecedence(),
    policyOptions: fieldsOf(parseJson(readPolicy(argv[2]))),
    policyIgnorePath: argv[3],
    projectRoot: input.projectRoot,
    liveProjectRoot: input.projectRoot,
  };
}

export function lacksLocation(error: unknown): boolean {
  return fieldOf(error, 'loc') === undefined;
}

export function ignoreOptions({ policyIgnorePath }: Layers): prettier.FileInfoOptions {
  return policyIgnorePath === undefined ? {} : { ignorePath: policyIgnorePath };
}
