import {
  prettierPrecedence as untypedPrettierPrecedence,
  readHeadPolicy as readUntypedHeadPolicy,
  readLayout as readUntypedLayout,
  typecheckEngine as untypedTypecheckEngine,
  usesLayeredPrettier as untypedUsesLayeredPrettier,
} from '../../preset/head-policy.mts';
import { layoutTransformFor } from '../../preset/tool-configs.mts';
import type { HeadPolicy as RealHeadPolicy } from '../../preset/typed/head-policy-types.mts';
import type { ResolvedLayout } from '../../preset/typed/layout-types.mts';
import { globMatcher as untypedGlobMatcher } from '../../../../shared/paths/glob.mts';

export const globMatcher: (pattern: string) => { test(value: string): boolean } =
  untypedGlobMatcher;

export type HeadPolicy = RealHeadPolicy;

export type Layout = ResolvedLayout;

export const readHeadPolicy: () => HeadPolicy = readUntypedHeadPolicy;

export const readLayout: () => Layout = readUntypedLayout;

export const typecheckEngine: () => string = untypedTypecheckEngine;

export const prettierPrecedence: () => readonly string[] = untypedPrettierPrecedence;

export const usesLayeredPrettier: () => boolean = untypedUsesLayeredPrettier;

export { layoutTransformFor };
