import { kotlinRecipe } from '../shared/kotlin-recipe.mjs';
import { leftIsolated, rightIsolated } from '../shared/boundaries.mjs';

const CHAIN = String.raw`[A-Za-z_]\w*(?:(?:\?\.|\.)[A-Za-z_]\w*)*`;
const NULL_OR_EMPTY = new RegExp(
  String.raw`(?<![\w.])(${CHAIN})\s*==\s*null\s*\|\|\s*\1\s*\.\s*isEmpty\s*\(\s*\)`,
  'gu',
);
const OR_EMPTY = new RegExp(
  String.raw`(?<![\w.])(${CHAIN})\s*\?:\s*(?:emptyList|emptySet|emptyMap|listOf|setOf|mapOf)\s*\(\s*\)`,
  'gu',
);
const CHAIN_ONLY = new RegExp(`^${CHAIN}$`, 'u');

function rewrites(pattern, method) {
  return ({ code }) =>
    [...code.matchAll(pattern)]
      .filter(
        ({ index, 0: text, 1: name }) =>
          CHAIN_ONLY.test(name) &&
          leftIsolated(code, index) &&
          rightIsolated(code, index + text.length),
      )
      .map(({ index, 0: text, 1: name }) => ({
        offset: index,
        edits: [{ start: index, end: index + text.length, text: `${name}.${method}()` }],
      }));
}

export const useIsNullOrEmptyRecipe = kotlinRecipe({
  id: 'kotlin-use-is-null-or-empty',
  rules: [{ tool: 'detekt', rule: 'detekt.style.UseIsNullOrEmpty' }],
  safety: 'review',
  where: 'both',
  find: rewrites(NULL_OR_EMPTY, 'isNullOrEmpty'),
});

export const useOrEmptyRecipe = kotlinRecipe({
  id: 'kotlin-use-or-empty',
  rules: [{ tool: 'detekt', rule: 'detekt.style.UseOrEmpty' }],
  safety: 'review',
  where: 'both',
  find: rewrites(OR_EMPTY, 'orEmpty'),
});
