import type { Layout } from '../../../adapters/typed/head-policy.mts';
import { fieldOf, fieldsOf, parseJson, textsOf } from '../../../../../shared/values/readers.mts';
import { resolveHeadPolicy as untypedResolveHeadPolicy } from '../../head-policy.mjs';
import {
  resolveLayout as untypedResolveLayout,
  resolveLayoutFor as untypedResolveLayoutFor,
} from '../../layout.mjs';
import {
  isCustomLayout as untypedIsCustomLayout,
  layoutStrykerTsconfig as untypedLayoutStrykerTsconfig,
  layoutJscpdConfig as untypedLayoutJscpdConfig,
  layoutKnipConfig as untypedLayoutKnipConfig,
  layoutTransformFor as untypedLayoutTransformFor,
  layoutTsconfig as untypedLayoutTsconfig,
} from '../../tool-configs.mjs';

export type Policy = {
  readonly exclude?: readonly string[];
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

export type TestLayout = Layout & {
  readonly testGlobs: readonly string[];
  readonly testSupportGlobs: readonly string[];
  readonly graphIncludeOnly: string;
  readonly excludePattern: string | undefined;
  readonly entryPoints?: readonly string[];
  isTestFixture(file: string): boolean;
  isSourceUnderRoot(file: string, root: string): boolean;
  sourceRootOf(file: string): string | undefined;
};

export type Tsconfig = {
  readonly extends: unknown;
  readonly compilerOptions: Readonly<Record<string, unknown>>;
  readonly include: string[];
  readonly exclude: string[];
};

type Transform = (text: string, targetPath: string) => string;

type TransformOptions = { readonly strictMutants: boolean };

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

export const resolveLayout: (layout?: Policy['layout'], exclude?: string[]) => TestLayout =
  untypedResolveLayout;

export const resolveLayoutFor: (policy?: Readonly<Record<string, unknown>>) => TestLayout =
  untypedResolveLayoutFor;

export const resolveHeadPolicy: (
  policy: Policy,
  projectRoot?: string,
) => { readonly layout: Readonly<Record<string, unknown>> } = untypedResolveHeadPolicy;

export const isCustomLayout: (layout: TestLayout) => boolean = untypedIsCustomLayout;

export const layoutTsconfig: (base: Tsconfig, layout: TestLayout) => Tsconfig =
  untypedLayoutTsconfig;

export const layoutStrykerTsconfig: (base: Tsconfig, layout: TestLayout) => Tsconfig =
  untypedLayoutStrykerTsconfig;

export const layoutTransformFor: (
  policyFileName: string,
  layout: TestLayout,
  options?: TransformOptions,
) => Transform | undefined = untypedLayoutTransformFor;

export const layoutJscpdConfig: (
  base: unknown,
  layout: TestLayout,
) => { readonly path: string[]; readonly ignore: string[] } = untypedLayoutJscpdConfig;

export const layoutKnipConfig: (
  base: unknown,
  layout: TestLayout,
) => { readonly entry: string[]; readonly project: string[]; readonly ignore: string[] } =
  untypedLayoutKnipConfig;

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
