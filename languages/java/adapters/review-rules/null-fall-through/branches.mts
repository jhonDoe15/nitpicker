import { isField, initialises } from './fields.mts';
import { useText } from './use-text.mts';
import { forward, frameAt, startsNewLine } from '../max-value-sums/source-file.mts';
import type { BareSource, SourceFile, Span } from '../max-value-sums/sum-types.mts';
import type { Token } from '../../reuse/jvm-reuse-types.mts';

export type FallThrough = {
  readonly line: number;
  readonly use: string;
  readonly name: string;
  readonly method: string;
};

const LEAVES = new Set(['return', 'throw', 'break', 'continue', 'exitProcess', 'error', 'TODO']);
const ASSIGNMENTS = new Set(['=', '+=', '-=', '*=', '/=']);
const UNBOXING = new Set(['-', '*', '/', '%', '<', '>', '<=', '>=', '++', '--']);
const REQUIRE_NON_NULL = new Set(['requireNonNull', 'requireNotNull', 'checkNotNull']);
const NULL_CHECKS = new Set(['==', '!=', '===', '!==']);
const GUARDS = new Set(['instanceof', 'is']);
const NULLABLE_EXTENSIONS = new Set([
  'orEmpty',
  'isNullOrEmpty',
  'isNullOrBlank',
  'toString',
  'hashCode',
  'equals',
  'let',
  'also',
  'run',
  'takeIf',
  'takeUnless',
]);
const OPERAND_COUNT = 3;
const STATEMENT_STARTS = new Set([';', '{', '}']);

function inSet(set: ReadonlySet<string>, text: string | undefined): boolean {
  return text !== undefined && set.has(text);
}

function nullCheck(
  source: BareSource,
  { from, to }: Span,
): { name: string; at: number } | undefined {
  const texts = source.tokens.slice(from, to).map(({ text }) => text);
  const member = texts[0] === 'this' && texts[1] === '.' ? 2 : 0;
  const [first, operator, last] = texts.slice(member);
  if (texts.length - member === OPERAND_COUNT && operator === '==') {
    if (last === 'null' && first !== undefined) {
      return { name: first, at: from + member };
    }
    return first === 'null' && member === 0 && last !== undefined
      ? { name: last, at: from + 2 }
      : undefined;
  }
  return undefined;
}

function statementEnd(source: BareSource, from: number): number {
  const { tokens, kotlin } = source;
  for (const { index, group } of forward(source, from)) {
    const text = tokens[index]?.text;
    const ends = kotlin ? index > from && startsNewLine(tokens, index) : text === ';' && !group;
    if (ends || text === '}') {
      return ends && !kotlin ? index + 1 : index;
    }
  }
  return tokens.length;
}

type Branch = Span & { readonly next: number };

function branchOf(source: BareSource, open: number): Branch {
  const { tokens, partner } = source;
  const start = (partner[open] ?? -1) + 1;
  const close = partner[start] ?? -1;
  if (tokens[start]?.text === '{' && close > start) {
    return { from: start + 1, to: close, next: close + 1 };
  }
  const end = statementEnd(source, start);
  return { from: start, to: end, next: end };
}

function leaves(source: BareSource, { from, to }: Span, name: string): boolean {
  const { tokens } = source;
  for (const [offset, { text }] of tokens.slice(from, to).entries()) {
    const index = from + offset;
    const previous = tokens[index - 1]?.text;
    const exits = text === 'exit' && previous === '.' && tokens[index - 2]?.text === 'System';
    const assigns =
      text === name && inSet(ASSIGNMENTS, tokens[index + 1]?.text) && previous !== '.';
    if ((LEAVES.has(text) && previous !== '.') || exits || assigns) {
      return true;
    }
  }
  return false;
}

function calls(source: BareSource, { from, to }: Span): { names: Set<string>; acts: boolean } {
  const { tokens } = source;
  const names = new Set<string>();
  let acts = false;
  for (const [offset, { text, kind }] of tokens.slice(from, to).entries()) {
    const index = from + offset;
    const callee = tokens[index - 1];
    if (text === '(' && callee?.kind === 'identifier') {
      names.add(callee.text);
      acts = true;
    }
    acts ||= kind === 'operator' && (ASSIGNMENTS.has(text) || text === '++' || text === '--');
  }
  return { names, acts };
}

function isDirectArgument(source: BareSource, index: number): boolean {
  const { tokens, opener } = source;
  const before = tokens[index - 1]?.text;
  const after = tokens[index + 1]?.text;
  const open = opener[index] ?? -1;
  return (
    (before === '(' || before === ',') &&
    (after === ')' || after === ',') &&
    open >= 0 &&
    tokens[open]?.text === '(' &&
    tokens[open - 1]?.kind === 'identifier'
  );
}

function isArithmetic(tokens: readonly Token[], side: string | undefined, other: number): boolean {
  return inSet(UNBOXING, side) || (side === '+' && tokens[other]?.kind === 'number');
}

function kindOfUse(source: BareSource, index: number, calledNames: ReadonlySet<string>): boolean {
  const { tokens, opener, kotlin } = source;
  const before = tokens[index - 1]?.text;
  const after = tokens[index + 1]?.text;
  const open = opener[index] ?? -1;
  const callee = tokens[open - 1]?.text;
  const iterates = before === ':' && callee === 'for' && tokens[open]?.text === '(';
  const direct = isDirectArgument(source, index);
  const forced = kotlin && after === '!!';
  const unboxed = isArithmetic(tokens, before, index - 2) || isArithmetic(tokens, after, index + 2);
  const member = after === '.' && !(kotlin && inSet(NULLABLE_EXTENSIONS, tokens[index + 2]?.text));
  const checked = direct && inSet(REQUIRE_NON_NULL, callee);
  const sameCall = direct && inSet(calledNames, callee);
  return member || after === '[' || iterates || forced || unboxed || checked || sameCall;
}

function verdictAt(
  source: BareSource,
  index: number,
  { name, calledNames }: { name: string; calledNames: ReadonlySet<string> },
): 'stop' | 'use' | undefined {
  const { tokens } = source;
  const text = tokens[index]?.text;
  const previous = tokens[index - 1]?.text;
  const own = previous !== '.' || (tokens[index - 2]?.text === 'this' && text === name);
  if (text !== name || !own) {
    return undefined;
  }
  const after = tokens[index + 1]?.text;
  const settled =
    inSet(ASSIGNMENTS, after) || inSet(NULL_CHECKS, after) || inSet(NULL_CHECKS, previous);
  if (settled || inSet(GUARDS, after)) {
    return 'stop';
  }
  return kindOfUse(source, index, calledNames) ? 'use' : undefined;
}

function firstUse(
  source: BareSource,
  { from, to }: Span,
  names: { name: string; calledNames: ReadonlySet<string> },
): number | undefined {
  for (const offset of source.tokens.slice(from, to).keys()) {
    const index = from + offset;
    const verdict = verdictAt(source, index, names);
    if (verdict !== undefined) {
      return verdict === 'use' ? index : undefined;
    }
  }
  return undefined;
}

function startsStatement(source: BareSource, index: number): boolean {
  const { tokens, kotlin } = source;
  const previous = tokens[index - 1];
  return (
    previous === undefined ||
    STATEMENT_STARTS.has(previous.text) ||
    (kotlin && startsNewLine(tokens, index) && previous.text !== 'else')
  );
}

export function findFallThroughs(source: SourceFile): FallThrough[] {
  const { tokens, partner, opener } = source;
  return [...tokens.keys()].flatMap((index): FallThrough[] => {
    const open = index + 1;
    const close = partner[open] ?? -1;
    const block = opener[index] ?? -1;
    if (
      tokens[index]?.text !== 'if' ||
      tokens[open]?.text !== '(' ||
      close < 0 ||
      block < 0 ||
      tokens[block]?.text !== '{' ||
      !startsStatement(source, index)
    ) {
      return [];
    }
    const check = nullCheck(source, { from: open + 1, to: close });
    if (check === undefined || tokens[check.at]?.kind !== 'identifier') {
      return [];
    }
    const branch = branchOf(source, open);
    const { names, acts } = calls(source, branch);
    const quiet = initialises(names) && isField(source, check);
    if (
      tokens[branch.next]?.text === 'else' ||
      !acts ||
      quiet ||
      leaves(source, branch, check.name)
    ) {
      return [];
    }
    const used = firstUse(
      source,
      { from: branch.next, to: partner[block] ?? -1 },
      { name: check.name, calledNames: names },
    );
    return used === undefined
      ? []
      : [
          {
            line: tokens[index].line,
            use: useText(source, used),
            name: check.name,
            method: frameAt(source, index)?.name ?? '',
          },
        ];
  });
}
