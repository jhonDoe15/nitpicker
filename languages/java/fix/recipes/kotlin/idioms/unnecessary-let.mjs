import { closingIndex } from '../../../../adapters/kotlin/scan/kotlin-source.mjs';
import { kotlinRecipe } from '../shared/kotlin-recipe.mjs';
import { withoutGroups } from '../shared/boundaries.mjs';

const LET = /(?<![\w.)\]!])((?:[A-Za-z_]\w*\??\.)*[A-Za-z_]\w*)(\??)\.let\s*\{/gu;
const MEMBERS = /^[A-Za-z_]\w*(?:(?:\?\.|\.)[A-Za-z_]\w*)*(?:!!)?$/u;
const CALLEE = /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/u;
const IT_MEMBER = /^it(\??)\.([\s\S]+)$/u;
const IT_ARGUMENT = /^([A-Za-z_][\w.]*)\(\s*it\s*\)$/u;

function memberAccess(body, safe, receiver) {
  const found = IT_MEMBER.exec(body);
  if (found === null || /\bit\b/u.test(found[2]) || found[2].includes('\n')) {
    return undefined;
  }
  return MEMBERS.test(withoutGroups(found[2]).trim()) && !/[{}]/u.test(found[2])
    ? `${receiver}${safe === '' && found[1] === '' ? '.' : '?.'}${found[2]}`
    : undefined;
}

function argument(body, safe, receiver) {
  const found = IT_ARGUMENT.exec(body);
  return found !== null && safe === '' && CALLEE.test(found[1]) && !/\bit\b/u.test(found[1])
    ? `${found[1]}(${receiver})`
    : undefined;
}

export const unnecessaryLetRecipe = kotlinRecipe({
  id: 'kotlin-unnecessary-let',
  rules: [{ tool: 'detekt', rule: 'detekt.style.UnnecessaryLet' }],
  where: 'both',
  find({ code, source }) {
    return [...code.matchAll(LET)].flatMap((match) => {
      const [text, receiver, safe] = match;
      const open = match.index + text.length - 1;
      const close = closingIndex(code, open);
      if (close >= code.length) {
        return [];
      }
      const body = code.slice(open + 1, close).trim();
      const replacement =
        memberAccess(source.slice(open + 1, close).trim(), safe, receiver) ??
        argument(source.slice(open + 1, close).trim(), safe, receiver);
      return body === '' || replacement === undefined
        ? []
        : [
            {
              offset: match.index,
              edits: [{ start: match.index, end: close + 1, text: replacement }],
            },
          ];
    });
  },
});
