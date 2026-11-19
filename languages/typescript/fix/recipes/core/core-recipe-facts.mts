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

type Choices = Pick<CoreFacts, 'module' | 'name'> &
  Partial<Pick<CoreFacts, 'safety' | 'presets' | 'options'>>;

function facts(rule: string, choices: Choices): CoreFacts {
  return { rule, safety: SAFE, presets: BOTH_PRESETS, options: [], ...choices };
}

export const CORE_RECIPES = {
  emptyStaticBlock: facts('no-empty-static-block', {
    module: 'statements/empty-static-block',
    name: 'emptyStaticBlockRecipe',
  }),
  uselessConcat: facts('no-useless-concat', {
    module: 'expressions/useless-concat',
    name: 'uselessConcatRecipe',
  }),
  uselessCatch: facts('no-useless-catch', {
    module: 'statements/useless-catch',
    name: 'uselessCatchRecipe',
  }),
  uselessCall: facts('no-useless-call', {
    module: 'expressions/useless-call',
    name: 'uselessCallRecipe',
    safety: REVIEW,
  }),
  duplicateImports: facts('no-duplicate-imports', {
    module: 'modules/duplicate-imports',
    name: 'duplicateImportsRecipe',
    options: [{ allowSeparateTypeImports: true }],
  }),
  unreachable: facts('no-unreachable', {
    module: 'statements/unreachable',
    name: 'unreachableRecipe',
    presets: ['javascript'],
  }),
  uselessAssignment: facts('no-useless-assignment', {
    module: 'statements/useless-assignment',
    name: 'uselessAssignmentRecipe',
    safety: REVIEW,
  }),
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
