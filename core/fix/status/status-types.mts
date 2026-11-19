import { type Fields, fieldOf, textOf, textsOf } from '../../../shared/values/readers.mts';
import type { RecipeListing, RuleMatcher } from '../typed/fix-types.mts';

export type { Fields, RecipeListing };

export type Notes = {
  readonly selectedRules: readonly string[];
  readonly preset?: string | undefined;
  readonly recipes: unknown;
  readonly result: {
    readonly notes?: readonly string[] | undefined;
    readonly fixedFiles?: readonly string[] | undefined;
  };
};

function isRecipeListings(value: unknown): value is readonly RecipeListing[] {
  return Array.isArray(value);
}

export function recipeListings(value: unknown): readonly RecipeListing[] {
  return isRecipeListings(value) ? value : [];
}

export function matcherOf(fields: Fields): RuleMatcher {
  const pattern = fieldOf(fields, 'pattern');
  return {
    tool: textOf(fieldOf(fields, 'tool')),
    rule: textOf(fieldOf(fields, 'rule')),
    ...(pattern === undefined ? {} : { pattern: textOf(pattern) }),
    findingTools: textsOf(fieldOf(fields, 'findingTools')),
    fixableIn: textsOf(fieldOf(fields, 'fixableIn')),
    suggestedIn: textsOf(fieldOf(fields, 'suggestedIn')),
  };
}
