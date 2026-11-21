import type { FactUnit } from '../facts/typed/fact-types.mts';
import type { TreeNode } from '../../near-duplicates/tree/tree-types.mts';

export type NearHole = { readonly a: TreeNode; readonly b: TreeNode };

export type NearRun = { readonly start: number; readonly end: number };

export type NearFinding = {
  readonly verdict: string;
  readonly units: readonly string[];
  readonly proof?: string | undefined;
  readonly parameters?: readonly NearHole[];
  readonly run?: readonly NearRun[];
  readonly rewritten: boolean;
};

export type NearSide = FactUnit & { readonly side: number };

export type NearPair = readonly [NearSide, NearSide];

export type NearMatch = { readonly finding: NearFinding; readonly pair: NearPair };
