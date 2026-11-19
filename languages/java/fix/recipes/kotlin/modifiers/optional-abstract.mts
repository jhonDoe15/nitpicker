import { enclosingBodyKind } from '../shared/body-kind.mts';
import { kotlinRecipe } from '../shared/kotlin-recipe.mts';
import { removalSpan } from '../shared/spans.mts';

const INTERFACE = 'interface';
const ABSTRACT = /(?<![\w.@:$`])abstract[ \t]+(?=(?:interface|fun|val|var)\b)/gu;

export const optionalAbstractRecipe = kotlinRecipe({
  id: 'kotlin-optional-abstract-keyword',
  keepComments: true,
  rules: [{ tool: 'detekt', rule: 'detekt.style.OptionalAbstractKeyword' }],
  find: ({ code, source }) =>
    [...code.matchAll(ABSTRACT)]
      .filter(({ index, 0: text }) => {
        const next = code.slice(index + text.length, index + text.length + INTERFACE.length);
        return next.startsWith(INTERFACE) || enclosingBodyKind(code, index) === INTERFACE;
      })
      .map(({ index, 0: text }) => ({
        offset: index,
        edits: [{ ...removalSpan(source, index, index + text.length), text: '' }],
      })),
});
