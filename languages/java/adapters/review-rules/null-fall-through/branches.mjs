import { isField, initialises } from './fields.mjs';
import { useText } from './use-text.mjs';
import { frameAt, startsNewLine } from '../max-value-sums/source-file.mjs';
import { statementStop } from '../value-checks/scan.mjs';

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

function nullCheck(source, { from, to }) {
  const texts = source.tokens.slice(from, to).map(({ text }) => text);
  const member = texts[0] === 'this' && texts[1] === '.' ? 2 : 0;
  const operands = texts.slice(member);
  if (operands.length === OPERAND_COUNT && operands[1] === '==') {
    if (operands[2] === 'null') {
      return { name: operands[0], at: from + member };
    }
    return operands[0] === 'null' && member === 0 ? { name: operands[2], at: from + 2 } : undefined;
  }
  return undefined;
}

function statementEnd(source, from) {
  const { index, ends } = statementStop(source, from);
  return ends && !source.kotlin ? index + 1 : index;
}

function branchOf(source, open) {
  const { tokens, partner } = source;
  const start = partner[open] + 1;
  if (tokens[start]?.text === '{' && partner[start] > start) {
    return { from: start + 1, to: partner[start], next: partner[start] + 1 };
  }
  const end = statementEnd(source, start);
  return { from: start, to: end, next: end };
}

function leaves(source, { from, to }, name) {
  const { tokens } = source;
  for (const [offset, { text }] of tokens.slice(from, to).entries()) {
    const index = from + offset;
    const previous = tokens[index - 1]?.text;
    const exits = text === 'exit' && previous === '.' && tokens[index - 2]?.text === 'System';
    const assigns = text === name && ASSIGNMENTS.has(tokens[index + 1]?.text) && previous !== '.';
    if ((LEAVES.has(text) && previous !== '.') || exits || assigns) {
      return true;
    }
  }
  return false;
}

function calls(source, { from, to }) {
  const { tokens } = source;
  const names = new Set();
  let acts = false;
  for (const [offset, { text, kind }] of tokens.slice(from, to).entries()) {
    const index = from + offset;
    if (text === '(' && tokens[index - 1]?.kind === 'identifier') {
      names.add(tokens[index - 1].text);
      acts = true;
    }
    acts ||= kind === 'operator' && (ASSIGNMENTS.has(text) || text === '++' || text === '--');
  }
  return { names, acts };
}

function isDirectArgument(source, index) {
  const { tokens, opener } = source;
  const before = tokens[index - 1]?.text;
  const after = tokens[index + 1]?.text;
  const open = opener[index];
  return (
    (before === '(' || before === ',') &&
    (after === ')' || after === ',') &&
    open >= 0 &&
    tokens[open].text === '(' &&
    tokens[open - 1]?.kind === 'identifier'
  );
}

function isArithmetic(tokens, side, other) {
  return UNBOXING.has(side) || (side === '+' && tokens[other]?.kind === 'number');
}

function kindOfUse(source, index, calledNames) {
  const { tokens, opener, kotlin } = source;
  const before = tokens[index - 1]?.text;
  const after = tokens[index + 1]?.text;
  const callee = tokens[opener[index] - 1]?.text;
  const iterates =
    before === ':' &&
    tokens[opener[index] - 1]?.text === 'for' &&
    tokens[opener[index]].text === '(';
  const direct = isDirectArgument(source, index);
  const forced = kotlin && after === '!!';
  const unboxed = isArithmetic(tokens, before, index - 2) || isArithmetic(tokens, after, index + 2);
  const member = after === '.' && !(kotlin && NULLABLE_EXTENSIONS.has(tokens[index + 2]?.text));
  const checked = direct && REQUIRE_NON_NULL.has(callee);
  const sameCall = direct && calledNames.has(callee);
  return member || after === '[' || iterates || forced || unboxed || checked || sameCall;
}

function verdictAt(source, index, { name, calledNames }) {
  const { tokens } = source;
  const { text } = tokens[index];
  const previous = tokens[index - 1]?.text;
  const own = previous !== '.' || (tokens[index - 2]?.text === 'this' && text === name);
  if (text !== name || !own) {
    return undefined;
  }
  const after = tokens[index + 1]?.text;
  const settled = ASSIGNMENTS.has(after) || NULL_CHECKS.has(after) || NULL_CHECKS.has(previous);
  if (settled || GUARDS.has(after)) {
    return 'stop';
  }
  return kindOfUse(source, index, calledNames) ? 'use' : undefined;
}

function firstUse(source, { from, to }, names) {
  for (const offset of source.tokens.slice(from, to).keys()) {
    const index = from + offset;
    const verdict = verdictAt(source, index, names);
    if (verdict !== undefined) {
      return verdict === 'use' ? index : undefined;
    }
  }
  return undefined;
}

function startsStatement(source, index) {
  const { tokens, kotlin } = source;
  const previous = tokens[index - 1];
  return (
    previous === undefined ||
    STATEMENT_STARTS.has(previous.text) ||
    (kotlin && startsNewLine(tokens, index) && previous.text !== 'else')
  );
}

export function findFallThroughs(source) {
  const { tokens, partner, opener } = source;
  return [...tokens.keys()].flatMap((index) => {
    const open = index + 1;
    const block = opener[index];
    if (
      tokens[index].text !== 'if' ||
      tokens[open]?.text !== '(' ||
      partner[open] < 0 ||
      block < 0 ||
      tokens[block].text !== '{' ||
      !startsStatement(source, index)
    ) {
      return [];
    }
    const check = nullCheck(source, { from: open + 1, to: partner[open] });
    if (check === undefined || tokens[check.at].kind !== 'identifier') {
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
      { from: branch.next, to: partner[block] },
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
