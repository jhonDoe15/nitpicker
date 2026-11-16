import type { ShapeNode, Unit } from '../jvm-types.mts';
import { findNearDuplicates as untypedFindNearDuplicates } from '../../../../../shared/near-duplicates/engine.mjs';
import { nearDuplicateFindings as untypedNearDuplicateFindings } from '../../../../../shared/rules/near-duplicates/near-duplicates.mjs';
import { decidedConditionFindings as untypedDecidedConditionFindings } from '../../../../../shared/rules/decided/decided-conditions.mjs';
import { duplicateBranchFindings as untypedDuplicateBranchFindings } from '../../../../../shared/rules/branches/duplicate-branches.mjs';
import { readJvmUnits as untypedReadJvmUnits } from '../jvm-trees.mjs';

export type Refusal = {
  readonly units: readonly string[];
  readonly subject: string;
  readonly counterexample: string;
};

export type NearFinding = {
  readonly verdict: string;
  readonly proof?: string | undefined;
  readonly units: readonly string[];
  readonly parameters: readonly { kind: string; a: ShapeNode; b: ShapeNode }[];
  readonly run?: readonly unknown[];
};

export type RuleFinding = {
  readonly message: string;
  readonly identity?: string;
  readonly symbol?: string | undefined;
  readonly classification: string;
  readonly location?: { readonly line: number };
};

type RuleOptions = {
  readonly analyzerName: string;
  readonly isExcepted: () => boolean;
};

export const findNearDuplicates: (
  units: readonly Unit[],
  options?: { readonly refuted: Refusal[] },
) => NearFinding[] = untypedFindNearDuplicates;

export const nearDuplicateFindings: (
  units: readonly Unit[],
  options: RuleOptions,
) => RuleFinding[] = untypedNearDuplicateFindings;

export const decidedConditionFindings: (
  units: readonly Unit[],
  options: RuleOptions,
) => RuleFinding[] = untypedDecidedConditionFindings;

export const duplicateBranchFindings: (
  units: readonly Unit[],
  options: RuleOptions,
) => RuleFinding[] = untypedDuplicateBranchFindings;

export const readJvmUnits: (projectRoot: string, files: readonly string[]) => unknown =
  untypedReadJvmUnits;
