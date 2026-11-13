import { closingIndex } from '../../../../adapters/kotlin/scan/kotlin-source.mjs';
import { kotlinRecipe } from '../shared/kotlin-recipe.mjs';
import { removalSpan } from '../shared/spans.mjs';

const PROPERTY =
  /^([ \t]*)private[ \t]+(?:val|var)[ \t]+([A-Za-z]\w*)[ \t]*(?::[^=\n]+)?=[^\n]*$/gmu;
const ALLOWED = /^(?:ignored|expected|serialVersionUID)$/u;
const FUNCTION = /^([ \t]*)private[ \t]+fun[ \t]+([A-Za-z]\w*)[ \t]*\(/gmu;

function mentions(source, name) {
  return [...source.matchAll(new RegExp(String.raw`(?<![\w])${name}(?![\w])`, 'gu'))].length;
}

function bareAbove(code, index) {
  const before = code.slice(0, index).trimEnd();
  return !before
    .slice(before.lastIndexOf('\n') + 1)
    .trim()
    .startsWith('@');
}

function surplus(text, open, close) {
  return text.split(open).length - text.split(close).length;
}

function balanced(text) {
  return (
    surplus(text, '(', ')') === 0 && surplus(text, '{', '}') === 0 && surplus(text, '[', ']') === 0
  );
}

function removal(source, start, end) {
  return [{ ...removalSpan(source, start, end), text: '' }];
}

function properties({ code, source }) {
  return [...code.matchAll(PROPERTY)]
    .filter(
      ({ index, 0: text, 2: name }) =>
        !ALLOWED.test(name) &&
        bareAbove(code, index) &&
        balanced(text) &&
        !/\bby\b/u.test(text) &&
        mentions(source, name) === 1,
    )
    .map(({ index, 0: text, 1: indent }) => ({
      rule: 'detekt.style.UnusedPrivateProperty',
      offset: index + indent.length,
      edits: removal(source, index + indent.length, index + text.length),
    }));
}

function functions({ code, source }) {
  return [...code.matchAll(FUNCTION)].flatMap(({ index, 0: text, 1: indent, 2: name }) => {
    const open = index + text.length - 1;
    const parameters = closingIndex(code, open);
    const body = /^\s*(?::[^{=\n]*)?\{/u.exec(code.slice(parameters + 1));
    if (!bareAbove(code, index) || body === null || mentions(source, name) !== 1) {
      return [];
    }
    const start = index + indent.length;
    const end = closingIndex(code, parameters + body[0].length) + 1;
    return end > code.length
      ? []
      : [
          {
            rule: 'detekt.style.UnusedPrivateMember',
            offset: start,
            edits: removal(source, start, end),
          },
        ];
  });
}

export const unusedPrivateRecipe = kotlinRecipe({
  id: 'kotlin-unused-private-members',
  rules: [
    { tool: 'detekt', rule: 'detekt.style.UnusedPrivateProperty' },
    { tool: 'detekt', rule: 'detekt.style.UnusedPrivateMember' },
  ],
  safety: 'review',
  where: 'both',
  find: (scanned) => [...properties(scanned), ...functions(scanned)],
});
