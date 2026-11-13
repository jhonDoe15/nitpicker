import {
  prettierPrecedence as untypedPrettierPrecedence,
  readLayout as readUntypedLayout,
  typecheckEngine as untypedTypecheckEngine,
  usesLayeredPrettier as untypedUsesLayeredPrettier,
} from '../../preset/head-policy.mjs';
import { layoutTransformFor as untypedLayoutTransformFor } from '../../preset/tool-configs.mjs';

export type Layout = {
  readonly exclude: readonly string[];
  readonly graphRoots: readonly string[];
  isExcluded(relativePath: string): boolean;
  readonly isSourceFile: (relativePath: string) => boolean;
  readonly isRunnableTestFile: (relativePath: string) => boolean;
  projectCodeFiles(projectRoot: string): readonly string[];
};

export const readLayout: () => Layout = readUntypedLayout;

export const typecheckEngine: () => string = untypedTypecheckEngine;

export const prettierPrecedence: () => readonly string[] = untypedPrettierPrecedence;

export const usesLayeredPrettier: () => boolean = untypedUsesLayeredPrettier;

export const layoutTransformFor: (policyFileName: string, layout: Layout) => unknown =
  untypedLayoutTransformFor;
