import { closingIndex } from '../../../../adapters/kotlin/scan/kotlin-source.mjs';
import { kotlinRecipe } from '../shared/kotlin-recipe.mjs';
import { indicesDown } from '../shared/spans.mjs';

const EXPLICIT_IT = /\{(\s*)it\s*->[ \t]*/gu;

const PAREN_DEPTH = { ')': 1, '(': -1 };

function guardsWhen(code, brace) {
  const before = code.slice(0, brace).trimEnd();
  if (before.endsWith('when')) {
    return true;
  }
  if (!before.endsWith(')')) {
    return false;
  }
  let depth = 0;
  const index = indicesDown(before.length - 1).find((at) => {
    depth += PAREN_DEPTH[before[at]] ?? 0;
    return depth === 0;
  });
  return index !== undefined && /\bwhen\s*$/u.test(before.slice(0, index));
}

export const explicitItRecipe = kotlinRecipe({
  id: 'kotlin-explicit-it-lambda-parameter',
  keepComments: true,
  rules: [{ tool: 'detekt', rule: 'detekt.style.ExplicitItLambdaParameter' }],
  where: 'both',
  find: ({ code }) =>
    [...code.matchAll(EXPLICIT_IT)]
      .filter(({ index }) => !guardsWhen(code, index) && closingIndex(code, index) < code.length)
      .map(({ index, 0: text }) => {
        const next = code[index + text.length];
        return {
          offset: index,
          edits: [
            {
              start: index + 1,
              end: index + text.length,
              text: next === '\n' || next === undefined ? '' : ' ',
            },
          ],
        };
      }),
});
