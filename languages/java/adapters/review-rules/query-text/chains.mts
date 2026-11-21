import { forward, startsNewLine } from '../max-value-sums/source/source-file.mts';
import { OPAQUE } from '../../../../../shared/rules/query-text/query-text.mts';
import { literalText } from '../affix-boundaries/boundaries.mts';
import type { Token } from '../../reuse/jvm-reuse-types.mts';
import type { BareSource } from '../max-value-sums/sum-types.mts';

export type ChainOperand = {
  readonly from: number;
  readonly to: number;
  readonly literal: boolean;
};
export type Chain = { readonly operands: ChainOperand[]; readonly end: number };

const STOPS = new Set([
  ';',
  ',',
  ')',
  ']',
  '}',
  '?',
  ':',
  '&&',
  '||',
  '==',
  '!=',
  '{',
  '->',
  '=',
  '+=',
]);
const TEMPLATE_PART = /\$\{[^}]*\}|\$[\p{L}_][\p{L}\p{N}_]*/gu;
const TEXT_BLOCK = /^"""\r?\n?([\s\S]*)"""$/u;

export function stringText(token: Token, { kotlin }: { kotlin: boolean }): string {
  const block = TEXT_BLOCK.exec(token.text)?.[1];
  const text =
    block ?? literalText({ kind: 'string', text: token.text }) ?? token.text.slice(1, -1);
  return kotlin ? text.replaceAll(TEMPLATE_PART, OPAQUE) : text;
}

function operandEnd(source: BareSource, from: number): number {
  const { tokens } = source;
  let end = from;
  for (const { index, end: next, group } of forward(source, from)) {
    const text = tokens[index]?.text ?? '';
    const stops =
      !group &&
      (STOPS.has(text) ||
        text === '+' ||
        (source.kotlin && index > from && startsNewLine(tokens, index)));
    if (stops) {
      return end;
    }
    end = next;
  }
  return end;
}

export function chainFrom(source: BareSource, start: number): Chain {
  const { tokens } = source;
  const operands: ChainOperand[] = [{ from: start, to: start + 1, literal: true }];
  let end = start + 1;
  const pending = [end];
  for (const position of pending) {
    if (tokens[position]?.text !== '+' || position + 1 >= tokens.length) {
      break;
    }
    const from = position + 1;
    const literal = tokens[from]?.kind === 'string';
    const to = literal ? from + 1 : Math.max(from + 1, operandEnd(source, from));
    operands.push({ from, to, literal });
    end = to;
    pending.push(to);
  }
  return { operands, end };
}

export function chainText(source: BareSource, operands: readonly ChainOperand[]): string {
  return operands
    .map(({ from, literal }) => {
      const token = source.tokens[from];
      return literal && token !== undefined ? stringText(token, { kotlin: source.kotlin }) : OPAQUE;
    })
    .join('');
}
