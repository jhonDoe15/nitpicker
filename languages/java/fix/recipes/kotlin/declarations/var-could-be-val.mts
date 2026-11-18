import { kindOfBody } from '../shared/body-kind.mts';
import { kotlinRecipe } from '../shared/kotlin-recipe.mts';
import { closingIndex, enclosingOpen, escapeRegExp } from '../shared/kotlin-scan.mts';

const LOCAL_VAR = /(?<![\w.`])var([ \t]+)([A-Za-z_]\w*)[ \t]*(?::[^=\n(]+)?=(?!=)/gu;

function isStatementStart(code: string, index: number): boolean {
  const before = code.slice(code.lastIndexOf('\n', index - 1) + 1, index).trim();
  return before === '' || before.endsWith('{') || before.endsWith(';');
}

function enclosingBlock(
  code: string,
  index: number,
): { readonly open: number; readonly close: number } | undefined {
  const open = enclosingOpen(code, index);
  if (open === -1) {
    return undefined;
  }
  const close = closingIndex(code, open);
  return kindOfBody(code, open) !== 'other' || close >= code.length ? undefined : { open, close };
}

function reassigned(rest: string, raw: string): boolean {
  const name = escapeRegExp(raw);
  const assignment = new RegExp(
    String.raw`(?<![\w.])${name}\s*(?:[-+*/%]?=(?!=)|\+\+|--)|(?:\+\+|--)\s*${name}\b|::\s*${name}\b`,
    'u',
  );
  return assignment.test(rest);
}

function redeclared(block: string, raw: string): boolean {
  const name = escapeRegExp(raw);
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
      const name = match[2] ?? '';
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
