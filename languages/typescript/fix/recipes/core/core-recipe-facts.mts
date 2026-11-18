import {
  REVIEW as untypedReview,
  SAFE as untypedSafe,
} from '../../../../../core/fix/engine/safety.mjs';

const SAFE: string = untypedSafe;
const REVIEW: string = untypedReview;
const BOTH_PRESETS = ['typescript', 'javascript'];

type File = { readonly path: string; readonly text: string };
type Inputs = { readonly isExcepted?: (ruleId: string, name: string) => boolean };
type Edit = {
  readonly type: string;
  readonly path: string;
  readonly start: number;
  readonly end: number;
  readonly text: string;
};
type Finding = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly line: number;
};
export type Fix = { readonly finding: Finding; readonly edits: readonly Edit[] };
export type Planned = { readonly fixes: readonly Fix[]; readonly notes: readonly string[] };
export type PlanContext = { readonly files: readonly File[]; readonly inputs: Inputs };

export type FileRecipe = {
  readonly id: string;
  readonly rules: readonly { readonly tool: string; readonly rule: string }[];
  readonly presets: readonly string[];
  readonly scope: 'file';
  readonly safety: string;
  readonly plan: (context: PlanContext) => Planned;
};

export type CoreFacts = {
  readonly rule: string;
  readonly module: string;
  readonly name: string;
  readonly safety: string;
  readonly presets: readonly string[];
  readonly options: readonly unknown[];
};

type Choices = Partial<Pick<CoreFacts, 'safety' | 'presets' | 'options'>>;

function facts(rule: string, module: string, name: string, choices: Choices = {}): CoreFacts {
  return { rule, module, name, safety: SAFE, presets: BOTH_PRESETS, options: [], ...choices };
}

export const CORE_RECIPES = {
  emptyStaticBlock: facts(
    'no-empty-static-block',
    'statements/empty-static-block',
    'emptyStaticBlockRecipe',
  ),
  uselessConcat: facts('no-useless-concat', 'expressions/useless-concat', 'uselessConcatRecipe'),
  uselessCatch: facts('no-useless-catch', 'statements/useless-catch', 'uselessCatchRecipe'),
  uselessCall: facts('no-useless-call', 'expressions/useless-call', 'uselessCallRecipe', {
    safety: REVIEW,
  }),
  duplicateImports: facts(
    'no-duplicate-imports',
    'modules/duplicate-imports',
    'duplicateImportsRecipe',
    { options: [{ allowSeparateTypeImports: true }] },
  ),
  unreachable: facts('no-unreachable', 'statements/unreachable', 'unreachableRecipe', {
    presets: ['javascript'],
  }),
  uselessAssignment: facts(
    'no-useless-assignment',
    'statements/useless-assignment',
    'uselessAssignmentRecipe',
    { safety: REVIEW },
  ),
} satisfies Readonly<Record<string, CoreFacts>>;

export function recipeFields(recipe: CoreFacts): Omit<FileRecipe, 'plan'> {
  return {
    id: `typescript-${recipe.rule}`,
    rules: [{ tool: 'eslint', rule: recipe.rule }],
    presets: recipe.presets,
    scope: 'file',
    safety: recipe.safety,
  };
}
