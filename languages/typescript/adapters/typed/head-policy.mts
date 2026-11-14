import {
  prettierPrecedence as untypedPrettierPrecedence,
  readHeadPolicy as readUntypedHeadPolicy,
  readLayout as readUntypedLayout,
  typecheckEngine as untypedTypecheckEngine,
  usesLayeredPrettier as untypedUsesLayeredPrettier,
} from '../../preset/head-policy.mjs';
import { layoutTransformFor as untypedLayoutTransformFor } from '../../preset/tool-configs.mjs';

export type EslintToolSettings = { readonly engine?: string };

export type HeadPolicy = {
  readonly exceptions: unknown[];
  readonly testConsole: { readonly allow?: unknown[] };
  readonly tools: { readonly knip?: unknown; readonly eslint?: EslintToolSettings };
  readonly history: unknown;
  readonly thresholds?: unknown;
};

export type Layout = {
  readonly exclude: readonly string[];
  readonly graphRoots: readonly string[];
  readonly sourceRoots: readonly string[];
  readonly javascript: boolean;
  isExcluded(relativePath: string): boolean;
  readonly isSourceFile: (relativePath: string) => boolean;
  readonly isRunnableTestFile: (relativePath: string) => boolean;
  readonly isTestFile: (relativePath: string) => boolean;
  readonly testRoots: readonly string[];
  readonly sourceGlobs: readonly string[];
  readonly sourceTestDirectoryGlobs: readonly string[];
  readonly runnerSourceTestGlobs: readonly string[];
  readonly excludedGlobs: readonly string[];
  readonly isEndToEndTest: (relativePath: string) => boolean;
  projectCodeFiles(projectRoot: string, roots?: readonly string[]): readonly string[];
};

export const readHeadPolicy: () => HeadPolicy = readUntypedHeadPolicy;

export const readLayout: () => Layout = readUntypedLayout;

export const typecheckEngine: () => string = untypedTypecheckEngine;

export const prettierPrecedence: () => readonly string[] = untypedPrettierPrecedence;

export const usesLayeredPrettier: () => boolean = untypedUsesLayeredPrettier;

export const layoutTransformFor: (policyFileName: string, layout: Layout) => unknown =
  untypedLayoutTransformFor;
