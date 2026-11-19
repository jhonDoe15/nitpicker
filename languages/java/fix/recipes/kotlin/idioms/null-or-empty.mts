import { leftIsolated, rightIsolated } from '../shared/boundaries.mts';
import { kotlinRecipe } from '../shared/kotlin-recipe.mts';
import { escapeRegExp } from '../shared/kotlin-scan.mts';
import type { KotlinFound, ScannedKotlin } from '../shared/kotlin-scan.mts';

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
const COLLECTIONS = ['List', 'MutableList', 'Set', 'MutableSet', 'Map', 'MutableMap', 'Collection'];
const NULL_OR_EMPTY_TYPES = new Set([
  ...COLLECTIONS,
  'MutableCollection',
  'String',
  'CharSequence',
]);
const OR_EMPTY_TYPES = new Set(COLLECTIONS);

function declaredNullable(code: string, chain: string, known: ReadonlySet<string>): boolean {
  const name = chain.split(/\?\.|\./u).at(-1) ?? '';
  const declaration = new RegExp(
    String.raw`(?<![\w.])${escapeRegExp(name)}\s*:\s*(?:[A-Za-z_]\w*\.)*([A-Za-z_]\w*)\s*(?:<[^()=]*>)?\s*\?`,
    'gu',
  );
  const types = [...code.matchAll(declaration)].map(({ 1: type = '' }) => type);
  return types.length > 0 && types.every((type) => known.has(type));
}

function rewrites(
  pattern: RegExp,
  method: string,
  known: ReadonlySet<string>,
): (scanned: ScannedKotlin) => readonly KotlinFound[] {
  return ({ code }) =>
    [...code.matchAll(pattern)]
      .filter(
        ({ index, 0: text, 1: name = '' }) =>
          CHAIN_ONLY.test(name) &&
          declaredNullable(code, name, known) &&
          leftIsolated(code, index) &&
          rightIsolated(code, index + text.length),
      )
      .map(({ index, 0: text, 1: name = '' }) => ({
        offset: index,
        edits: [{ start: index, end: index + text.length, text: `${name}.${method}()` }],
      }));
}

export const useIsNullOrEmptyRecipe = kotlinRecipe({
  id: 'kotlin-use-is-null-or-empty',
  rules: [{ tool: 'detekt', rule: 'detekt.style.UseIsNullOrEmpty' }],
  safety: 'review',
  where: 'both',
  find: rewrites(NULL_OR_EMPTY, 'isNullOrEmpty', NULL_OR_EMPTY_TYPES),
});

export const useOrEmptyRecipe = kotlinRecipe({
  id: 'kotlin-use-or-empty',
  rules: [{ tool: 'detekt', rule: 'detekt.style.UseOrEmpty' }],
  safety: 'review',
  where: 'both',
  find: rewrites(OR_EMPTY, 'orEmpty', OR_EMPTY_TYPES),
});
