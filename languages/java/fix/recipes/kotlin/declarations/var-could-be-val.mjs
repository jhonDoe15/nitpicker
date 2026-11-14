import { closingIndex, enclosingOpen } from '../../../../adapters/kotlin/scan/kotlin-source.mjs';
import { kotlinRecipe } from '../shared/kotlin-recipe.mjs';
import { indicesDown } from '../shared/spans.mjs';

const LOCAL_VAR = /(?<![\w.`])var([ \t]+)([A-Za-z_]\w*)[ \t]*(?::[^=\n(]+)?=(?!=)/gu;
const TYPE_BODY = /(?<![\w.])(?:class|object|interface)\b/u;

function isStatementStart(code, index) {
  const before = code.slice(code.lastIndexOf('\n', index - 1) + 1, index).trim();
  return before === '' || before.endsWith('{') || before.endsWith(';');
}

const GROUP_DEPTH = { ')': 1, ']': 1, '(': -1, '[': -1 };

function headerBefore(code, open) {
  let depth = 0;
  const at = indicesDown(open - 1).find((position) => {
    depth += GROUP_DEPTH[code[position]] ?? 0;
    return depth === 0 && ';{}'.includes(code[position]);
  });
  return code.slice((at ?? -1) + 1, open);
}

function enclosingBlock(code, index) {
  const open = enclosingOpen(code, index);
  if (open === -1) {
    return undefined;
  }
  const close = closingIndex(code, open);
  return TYPE_BODY.test(headerBefore(code, open)) || close >= code.length
    ? undefined
    : { open, close };
}

function reassigned(rest, name) {
  const assignment = new RegExp(
    String.raw`(?<![\w.])${name}\s*(?:[-+*/%]?=(?!=)|\+\+|--)|(?:\+\+|--)\s*${name}\b|::\s*${name}\b`,
    'u',
  );
  return assignment.test(rest);
}

function redeclared(block, name) {
  const declared = new RegExp(
    String.raw`(?<![\w.])(?:val|var)\s+(?:\(.*\b${name}\b.*\)|${name}\b)`,
    'gu',
  );
  return (
    [...block.matchAll(declared)].length > 1 ||
    new RegExp(String.raw`[(,]\s*${name}\s*(?:,[^)]*)?\)\s*=`).test(block)
  );
}

export const varCouldBeValRecipe = kotlinRecipe({
  id: 'kotlin-var-could-be-val',
  rules: [{ tool: 'detekt', rule: 'detekt.style.VarCouldBeVal' }],
  find({ code }) {
    return [...code.matchAll(LOCAL_VAR)].flatMap((match) => {
      const block = enclosingBlock(code, match.index);
      if (block === undefined || !isStatementStart(code, match.index)) {
        return [];
      }
      const name = match[2];
      const rest = code.slice(match.index + match[0].length, block.close);
      const earlier = code.slice(block.open + 1, match.index);
      const whole = code.slice(block.open, block.close);
      return reassigned(rest, name) || reassigned(earlier, name) || redeclared(whole, name)
        ? []
        : [
            {
              offset: match.index,
              edits: [{ start: match.index, end: match.index + 'var'.length, text: 'val' }],
            },
          ];
    });
  },
});
