import { kotlinRecipe } from '../shared/kotlin-recipe.mts';
import type { KotlinFound, ScannedKotlin } from '../shared/kotlin-scan.mts';
import { shadowsStandardCalls } from './precondition-calls.mts';

const NOT_NULL =
  /(?<![\w.])(require|check)\s*\(\s*([A-Za-z_]\w*(?:\s*\.\s*[A-Za-z_]\w*)*)\s*!=\s*null\s*\)/gu;

function notNullChecks(
  call: string,
  rule: string,
): (scanned: ScannedKotlin) => readonly KotlinFound[] {
  return (scanned) =>
    shadowsStandardCalls(scanned.code)
      ? []
      : [...scanned.code.matchAll(NOT_NULL)]
          .filter(({ 1: name }) => name === call)
          .map(({ index, 0: text, 2: target }) => ({
            rule,
            offset: index,
            edits: [
              {
                start: index,
                end: index + text.length,
                text: `${call}NotNull(${(target ?? '').replaceAll(/\s+/gu, '')})`,
              },
            ],
          }));
}

export const useRequireNotNullRecipe = kotlinRecipe({
  id: 'kotlin-use-require-not-null',
  rules: [{ tool: 'detekt', rule: 'detekt.style.UseRequireNotNull' }],
  find: notNullChecks('require', 'detekt.style.UseRequireNotNull'),
});

export const useCheckNotNullRecipe = kotlinRecipe({
  id: 'kotlin-use-check-not-null',
  rules: [{ tool: 'detekt', rule: 'detekt.style.UseCheckNotNull' }],
  find: notNullChecks('check', 'detekt.style.UseCheckNotNull'),
});
