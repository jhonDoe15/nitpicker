import { enclosingOpen } from '../../../../adapters/kotlin/scan/kotlin-source.mjs';
import { kotlinRecipe } from '../shared/kotlin-recipe.mjs';
import { removalSpan } from '../shared/spans.mjs';

const ABSTRACT = /(?<![\w.@:$`])abstract[ \t]+(?=(?:interface|fun|val|var)\b)/gu;
const INTERFACE_HEADER = /(?<![\w.])interface\s+[A-Za-z_`]/u;

function insideInterface(code, offset) {
  const open = enclosingOpen(code, offset);
  if (open === -1) {
    return false;
  }
  const before = code.slice(0, open);
  const boundary = Math.max(
    before.lastIndexOf(';'),
    before.lastIndexOf('{'),
    before.lastIndexOf('}'),
  );
  return INTERFACE_HEADER.test(before.slice(boundary + 1));
}

export const optionalAbstractRecipe = kotlinRecipe({
  id: 'kotlin-optional-abstract-keyword',
  keepComments: true,
  rules: [{ tool: 'detekt', rule: 'detekt.style.OptionalAbstractKeyword' }],
  find: ({ code, source }) =>
    [...code.matchAll(ABSTRACT)]
      .filter(({ index, 0: text }) => {
        const next = code.slice(index + text.length, index + text.length + 'interface'.length);
        return next.startsWith('interface') || insideInterface(code, index);
      })
      .map(({ index, 0: text }) => ({
        offset: index,
        edits: [{ ...removalSpan(source, index, index + text.length), text: '' }],
      })),
});
