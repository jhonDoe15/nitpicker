import { kotlinRecipe } from '../shared/kotlin-recipe.mjs';
import { shadowsStandardCalls } from './precondition-calls.mjs';

const NOT_NULL =
  /(?<![\w.])(require|check)\s*\(\s*([A-Za-z_]\w*(?:\s*\.\s*[A-Za-z_]\w*)*)\s*!=\s*null\s*\)/gu;

function notNullChecks(call, rule) {
  return (scanned) =>
    shadowsStandardCalls(scanned.code)
      ? []
      : [...scanned.code.matchAll(NOT_NULL)]
          .filter((match) => match[1] === call && true)
          .map((match) => ({
            rule,
            offset: match.index,
            edits: [
              {
                start: match.index,
                end: match.index + match[0].length,
                text: `${call}NotNull(${match[2].replaceAll(/\s+/gu, '')})`,
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
