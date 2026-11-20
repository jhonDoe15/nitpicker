import { applyFixes as untypedApplyFixes } from '../engine/edits/apply-edits.mts';
import { acceptFixes as untypedAcceptFixes } from '../engine/edits/check-fixes.mts';
import { createSnapshot as untypedCreateSnapshot } from '../engine/edits/snapshot.mts';
import {
  activeRecipes as untypedActiveRecipes,
  defineRecipes as untypedDefineRecipes,
} from '../engine/recipes.mts';
import { runRecipes as untypedRunRecipes } from '../engine/run-recipes.mts';
import { writeTexts as untypedWriteTexts } from '../engine/write-texts.mts';
import { callUntyped } from '../../../shared/values/boundaries/untyped-call.mts';
import { fieldOf } from '../../../shared/values/readers.mts';
import type { Snapshot } from '../typed/edit-types.mts';
import type { FixWriter } from '../typed/fix-types.mts';

export type { Snapshot };

type Rule = { readonly tool: string; readonly rule: string };

type FindingAt = Rule & { readonly path: string; readonly line: number };

export type Edit = {
  readonly type: string;
  readonly path?: string;
  readonly from?: string;
  readonly to?: string;
  readonly start?: number;
  readonly end?: number;
  readonly text?: string;
};

export type PlanFile = { readonly path: string; readonly text: string };

type FixPlan = {
  readonly finding: FindingAt;
  readonly edits: readonly Edit[];
  readonly stays?: string;
  readonly note?: string;
};

export type PlanContext = {
  readonly projectRoot: string;
  readonly files: readonly PlanFile[];
  readonly accepts: (name: string) => boolean;
  readonly read: (name: string) => string;
};

export type RecipeSpec = {
  readonly id: string;
  readonly rules: readonly Rule[];
  readonly presets: readonly string[];
  readonly scope: string;
  readonly safety: string;
  readonly plan: (context: PlanContext) => { readonly fixes: readonly FixPlan[] };
};

export type EngineEntry = {
  readonly name?: string;
  readonly recipe?: string;
  readonly safety?: string;
  readonly fix: {
    readonly finding?: FindingAt;
    readonly edits: readonly Edit[];
    readonly stays?: string;
    readonly note?: string;
  };
};

export type ApplyOutcome = {
  readonly applied: readonly EngineEntry[];
  readonly changedMeanwhile: readonly string[];
  readonly errors: readonly string[];
};

export type RunResult = {
  readonly fixedFindings: readonly string[];
  readonly files: readonly { readonly path: string }[];
  readonly toolErrors: readonly { readonly message: string }[];
  readonly notes: readonly string[];
};

function isRecipeSpecs(value: unknown): value is readonly RecipeSpec[] {
  return Array.isArray(value);
}

export function recipeSpecs(value: unknown): readonly RecipeSpec[] {
  return isRecipeSpecs(value) ? value : [];
}

export const defineRecipes: (recipes: readonly RecipeSpec[]) => readonly RecipeSpec[] =
  untypedDefineRecipes;

type RunOptions = {
  readonly projectRoot: string;
  readonly files: readonly { readonly path: string }[];
  readonly recipes: readonly RecipeSpec[];
  readonly preset: string;
  readonly selectedRules: readonly string[] | undefined;
  readonly accepts: (name: string) => boolean;
  readonly writer?: FixWriter | undefined;
  readonly inputs: unknown;
};

function isRunResult(value: unknown): value is RunResult {
  return ['fixedFindings', 'files', 'toolErrors', 'notes'].every((key) =>
    Array.isArray(fieldOf(value, key)),
  );
}

export function runRecipes(options: RunOptions): RunResult {
  const result = callUntyped(untypedRunRecipes, options);
  if (!isRunResult(result)) {
    throw new TypeError('runRecipes returned no result');
  }
  return result;
}

export const createSnapshot: (projectRoot: string, names: readonly string[]) => Snapshot =
  untypedCreateSnapshot;

function isApplyOutcome(value: unknown): value is ApplyOutcome {
  return ['applied', 'changedMeanwhile', 'errors'].every((key) =>
    Array.isArray(fieldOf(value, key)),
  );
}

export function applyFixes(
  projectRoot: string,
  snapshot: Snapshot,
  entries: readonly EngineEntry[],
): ApplyOutcome {
  const outcome = callUntyped(untypedApplyFixes, projectRoot, snapshot, entries);
  if (!isApplyOutcome(outcome)) {
    throw new TypeError('applyFixes returned no outcome');
  }
  return outcome;
}

export const writeTexts: (
  writer: FixWriter,
  planned: readonly { readonly name: string; readonly bytes: Buffer; readonly text: string }[],
  tool: string,
) => { readonly written: readonly string[] } = untypedWriteTexts;

type ActiveRecipes = {
  bivarianceHack(
    recipes: readonly object[],
    options: { readonly preset: string; readonly selectedRules?: readonly string[] | undefined },
  ): readonly object[];
}['bivarianceHack'];

export const activeRecipes: ActiveRecipes = untypedActiveRecipes;

export const acceptFixes: (
  planned: readonly {
    readonly recipe: string;
    readonly fix: { readonly edits: readonly object[] };
  }[],
) => {
  readonly accepted: readonly { readonly recipe: string }[];
  readonly skipped: readonly { readonly recipe: string }[];
} = untypedAcceptFixes;
