import { withoutGroups } from '../shared/boundaries.mts';
import { kotlinRecipe } from '../shared/kotlin-recipe.mts';
import { closingIndex } from '../shared/kotlin-scan.mts';

const LET = /(?<![\w.)\]!])((?:[A-Za-z_]\w*\??\.)*[A-Za-z_]\w*)(\??)\.let\s*\{/gu;
const MEMBERS = /^[A-Za-z_]\w*(?:(?:\?\.|\.)[A-Za-z_]\w*)*(?:!!)?$/u;
const CALLEE = /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/u;
const IT_MEMBER = /^it(\??)\.([\s\S]+)$/u;
const IT_ARGUMENT = /^([A-Za-z_][\w.]*)\(\s*it\s*\)$/u;

const IDENTIFIER = /^[A-Za-z_]\w*/u;
const BARE = /^[A-Za-z_]\w*$/u;

function singleSegment(member: string): boolean {
  const name = IDENTIFIER.exec(member)?.[0] ?? '';
  const rest = member.slice(name.length);
  if (name === '' || rest === '') {
    return name !== '';
  }
  let depth = 0;
  for (const [offset, character] of Array.from(rest).entries()) {
    depth += character === '(' ? 1 : 0;
    depth -= character === ')' ? 1 : 0;
    if (depth === 0 && offset < rest.length - 1) {
      return false;
    }
  }
  return rest.startsWith('(') && rest.endsWith(')') && depth === 0;
}

function memberAccess(body: string, safe: string, receiver: string): string | undefined {
  const found = IT_MEMBER.exec(body);
  const member = found?.[2];
  if (found === null || member === undefined || /\bit\b/u.test(member) || member.includes('\n')) {
    return undefined;
  }
  const plain = MEMBERS.test(withoutGroups(member).trim()) && !/[{}]/u.test(member);
  const nullSafe = safe === '' && found[1] === '' ? '.' : '?.';
  return plain && (safe === '' || singleSegment(member))
    ? `${receiver}${nullSafe}${member}`
    : undefined;
}

function argument(body: string, safe: string, receiver: string): string | undefined {
  const callee = IT_ARGUMENT.exec(body)?.[1];
  const ordered = callee !== undefined && (BARE.test(callee) || BARE.test(receiver));
  return ordered && safe === '' && CALLEE.test(callee) && !/\bit\b/u.test(callee)
    ? `${callee}(${receiver})`
    : undefined;
}

export const unnecessaryLetRecipe = kotlinRecipe({
  id: 'kotlin-unnecessary-let',
  rules: [{ tool: 'detekt', rule: 'detekt.style.UnnecessaryLet' }],
  where: 'both',
  find({ code, source }) {
    return [...code.matchAll(LET)].flatMap((match) => {
      const { 0: text, 1: receiver = '', 2: safe = '' } = match;
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
