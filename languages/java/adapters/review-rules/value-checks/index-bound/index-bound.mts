import { escapeRegExp as untypedEscape } from '../../../../../../shared/paths/glob.mjs';
import { forward } from '../../max-value-sums/source/source-file.mts';
import { blockBranch, eachFrame, statementEnd } from '../scan.mts';
import type { Branch, ValueCheck, ValueFound } from '../scan.mts';
import type { BareSource, Frame, SourceFile, Span } from '../../max-value-sums/sum-types.mts';

const INDEX_BOUND_RULE = 'IndexBoundOffByOne';

const LENGTHS = '(?:size\\(\\)|length\\(\\)|length|size|count)';
const REJECTING = new RegExp(
  `^(\\w+)>((?:\\w+\\.)*\\w+)\\.${LENGTHS}$|^((?:\\w+\\.)*\\w+)\\.${LENGTHS}<(\\w+)$`,
  'u',
);
const ACCEPTING = new RegExp(
  `^(\\w+)<=((?:\\w+\\.)*\\w+)\\.${LENGTHS}$|^((?:\\w+\\.)*\\w+)\\.${LENGTHS}>=(\\w+)$`,
  'u',
);
const LEAVES = new Set(['return', 'throw', 'continue', 'break']);

const escapeRegExp: (value: string) => string = untypedEscape;

type Pair = { readonly index: string; readonly owner: string };
type IfStatement = { readonly index: number; readonly open: number; readonly close: number };
type Context = {
  readonly source: SourceFile;
  readonly statement: IfStatement;
  readonly branch: Branch;
  readonly frameText: string;
};
type IndexFound = ValueFound & { readonly owner: string; readonly rejects: boolean };
type Reading = Omit<IndexFound, 'method'>;

function pairOf(text: string, form: RegExp): Pair | undefined {
  const match = form.exec(text);
  if (match === null) {
    return undefined;
  }
  const [, index, owner, reversedOwner, reversedIndex] = match;
  if (index !== undefined && owner !== undefined) {
    return { index, owner };
  }
  return reversedIndex === undefined || reversedOwner === undefined
    ? undefined
    : { index: reversedIndex, owner: reversedOwner };
}

function joined(source: BareSource, from: number, to: number): string {
  return source.tokens.slice(from, to).reduce((text, { text: next }) => {
    const spaced = /\w$/u.test(text) && /^\w/u.test(next);
    return `${text}${spaced ? ' ' : ''}${next}`;
  }, '');
}

function splitOn(source: BareSource, { from, to }: Span, operator: string): Span[] {
  const parts: Span[] = [];
  let start = from;
  for (const { index, group } of forward(source, from)) {
    if (index >= to) {
      break;
    }
    if (!group && source.tokens[index]?.text === operator) {
      parts.push({ from: start, to: index });
      start = index + 1;
    }
  }
  return [...parts, { from: start, to }];
}

function readsOf(text: string, { index, owner }: Pair): boolean {
  const call = `\\.(?:get|charAt|elementAt)\\(${escapeRegExp(index)}\\)`;
  return new RegExp(
    `(?<![\\w.])${escapeRegExp(owner)}(?:${call}|\\[${escapeRegExp(index)}\\])`,
    'u',
  ).test(text);
}

function strictCheck(text: string, { index, owner }: Pair): boolean {
  const bound = `${escapeRegExp(owner)}\\.${LENGTHS}`;
  const strict = `${escapeRegExp(index)}(?:>=|<)${bound}|${bound}(?:<=|>)${escapeRegExp(index)}`;
  const moved = `(?<![\\w.])${escapeRegExp(index)}(?:=(?!=)|[-+*/]=|\\+\\+|--)|(?:\\+\\+|--)${escapeRegExp(index)}`;
  return new RegExp(`${strict}|${moved}`, 'u').test(text);
}

function branchOf(source: SourceFile, closeParen: number): Branch {
  const start = closeParen + 1;
  const block = blockBranch(source, start);
  if (block !== undefined) {
    return block;
  }
  const end = statementEnd(source, start);
  return { from: start, to: end, next: source.tokens[end]?.text === ';' ? end + 1 : end };
}

function leaves(source: SourceFile, { from, to }: Span): boolean {
  return source.tokens.slice(from, to).some(({ text }) => LEAVES.has(text));
}

function ifStatements(source: SourceFile, { from, to }: Span): IfStatement[] {
  const { tokens, partner } = source;
  const found: IfStatement[] = [];
  for (const [offset, token] of tokens.slice(from, to).entries()) {
    const index = from + offset;
    const open = index + 1;
    const close = partner[open] ?? -1;
    if (token.text === 'if' && tokens[open]?.text === '(' && close > open) {
      found.push({ index, open, close });
    }
  }
  return found;
}

function blockEnd(source: SourceFile, index: number): number {
  const open = source.opener[index] ?? -1;
  return open >= 0 ? (source.partner[open] ?? source.tokens.length) : source.tokens.length;
}

function rejectingFindings({ source, statement, branch, frameText }: Context): Reading[] {
  const { tokens } = source;
  const condition = { from: statement.open + 1, to: statement.close };
  const found: Reading[] = [];
  for (const part of splitOn(source, condition, '||')) {
    const pair = pairOf(joined(source, part.from, part.to), REJECTING);
    const later = joined(source, part.to, statement.close);
    const after =
      tokens[branch.next]?.text !== 'else' && leaves(source, branch)
        ? joined(source, branch.next, blockEnd(source, statement.index))
        : '';
    if (pair !== undefined && !strictCheck(frameText, pair) && readsOf(`${later}${after}`, pair)) {
      found.push({
        line: tokens[part.from]?.line ?? 0,
        name: pair.index,
        owner: pair.owner,
        rejects: true,
      });
    }
  }
  return found;
}

function acceptingFindings({ source, statement, branch, frameText }: Context): Reading[] {
  const { tokens } = source;
  const condition = { from: statement.open + 1, to: statement.close };
  const found: Reading[] = [];
  for (const part of splitOn(source, condition, '&&')) {
    const pair = pairOf(joined(source, part.from, part.to), ACCEPTING);
    const later = `${joined(source, part.to, statement.close)}${joined(source, branch.from, branch.to)}`;
    if (pair !== undefined && !strictCheck(frameText, pair) && readsOf(later, pair)) {
      found.push({
        line: tokens[part.from]?.line ?? 0,
        name: pair.index,
        owner: pair.owner,
        rejects: false,
      });
    }
  }
  return found;
}

function reportFor(source: SourceFile, statement: IfStatement, frameRange: Span): Reading[] {
  const context: Context = {
    source,
    statement,
    branch: branchOf(source, statement.close),
    frameText: joined(source, statement.open + 1, frameRange.to),
  };
  return [...rejectingFindings(context), ...acceptingFindings(context)];
}

function findIn(source: SourceFile, range: Span, frame: Frame): IndexFound[] {
  return ifStatements(source, range).flatMap((statement) =>
    reportFor(source, statement, range).map((found) => ({ ...found, method: frame.name })),
  );
}

export const INDEX_BOUND_CHECK: ValueCheck<IndexFound> = {
  rule: INDEX_BOUND_RULE,
  find: (source) => eachFrame(source, (range, frame) => findIn(source, range, frame)),
  message: ({ name, owner, rejects }) =>
    rejects
      ? `The check lets \`${name} == ${owner}.size()\` through, and the read ` +
        `\`${owner}[${name}]\` is then past the end; reject with \`>=\` (\`>\` is ` +
        `right only for an insertion position).`
      : `The check accepts \`${name} == ${owner}.size()\`, and the read ` +
        `\`${owner}[${name}]\` is then past the end; accept with \`<\` (\`<=\` is ` +
        `right only for an insertion position).`,
  allowed:
    'Compare with `index >= size` (reject) or `index < size` (accept) before a read; ' +
    '`>` and `<=` are right only for insertion positions.',
};
