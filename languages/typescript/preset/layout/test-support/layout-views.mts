import { fieldOf, fieldsOf, parseJson, textsOf } from '../../../../../shared/values/readers.mts';
import { resolveHeadPolicy } from '../../head-policy.mts';
import { resolveLayout, resolveLayoutFor } from '../../layout.mts';
import {
  isCustomLayout,
  layoutJscpdConfig,
  layoutKnipConfig,
  layoutStrykerTsconfig,
  layoutTsconfig,
} from '../../project-configs/typescript/layout-rewrites.mts';
import { layoutTransformFor } from '../../tool-configs.mts';
import type { TransformOptions } from '../../typed/tool-config/tool-config-types.mts';

export type Policy = {
  readonly exclude?: readonly string[];
  readonly react?: { readonly enabled: boolean };
  readonly layout?: {
    readonly sourceRoots?: readonly string[];
    readonly testRoots?: readonly string[];
    readonly entryPoints?: readonly string[];
    readonly colocatedTests?: true;
  };
  readonly frameworks?: {
    readonly defaultExports: readonly string[];
    readonly entryPoints: readonly string[];
  };
};

export type TestLayout = ReturnType<typeof resolveLayout>;

export type Tsconfig = {
  readonly extends: unknown;
  readonly compilerOptions: Readonly<Record<string, unknown>>;
  readonly include: string[];
  readonly exclude: string[];
};

type Transform = (text: string, targetPath: string) => string;

type VitestProject = {
  readonly test: {
    readonly include: string[];
    readonly exclude: string[];
    readonly restoreMocks: boolean;
    readonly globals?: unknown;
  };
};

export type VitestConfig = {
  readonly resolve: { readonly alias: Readonly<Record<string, string>> };
  readonly test: {
    readonly projects: VitestProject[] | undefined;
    readonly include: string[];
    readonly exclude: string[];
    readonly maxWorkers: number;
    readonly environment: string;
    readonly setupFiles: string[];
    readonly dir: string | undefined;
    readonly restoreMocks: boolean;
    readonly globals?: unknown;
    readonly coverage: {
      readonly provider: string;
      readonly thresholds: unknown;
      readonly include: string[];
      readonly exclude: string[];
    };
  };
};

export type ConfigEntry = {
  readonly files?: readonly (string | readonly string[])[];
  readonly ignores?: readonly string[];
  readonly rules?: Readonly<Record<string, unknown>>;
};

export {
  isCustomLayout,
  layoutJscpdConfig,
  layoutKnipConfig,
  layoutStrykerTsconfig,
  layoutTransformFor,
  layoutTsconfig,
  resolveHeadPolicy,
  resolveLayout,
  resolveLayoutFor,
};

export function compareText(left: string, right: string): number {
  return left < right ? -1 : 1;
}

export function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].toSorted(compareText);
}

export function tsconfigTransform(
  policyFileName: string,
  layout: TestLayout,
  options?: TransformOptions,
): Transform {
  const transform = layoutTransformFor(policyFileName, layout, options);
  if (transform === undefined) {
    throw new TypeError(`No layout transform for ${policyFileName}`);
  }
  return transform;
}

export function parseTsconfig(text: string): Tsconfig {
  const config = parseJson(text);
  return {
    extends: fieldOf(config, 'extends'),
    compilerOptions: fieldsOf(fieldOf(config, 'compilerOptions')),
    include: textsOf(fieldOf(config, 'include')),
    exclude: textsOf(fieldOf(config, 'exclude')),
  };
}

export type VitestConfigFactory = (root: string) => Promise<VitestConfig>;
