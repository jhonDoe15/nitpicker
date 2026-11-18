import { forward } from '../../max-value-sums/source-file.mjs';
import { eachFrame, statementEnd } from '../scan.mjs';

export const INDEX_BOUND_RULE = 'IndexBoundOffByOne';

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

function escape(text) {
  return text.replaceAll(/[$.*+?()[\]{}|\\^]/gu, String.raw`\$&`);
}

function pairOf(text, form) {
  const match = form.exec(text);
  if (match === null) {
    return undefined;
  }
  return match[1] === undefined
    ? { index: match[4], owner: match[3] }
    : { index: match[1], owner: match[2] };
}

function joined(source, from, to) {
  return source.tokens.slice(from, to).reduce((text, { text: next }) => {
    const spaced = /\w$/u.test(text) && /^\w/u.test(next);
    return `${text}${spaced ? ' ' : ''}${next}`;
  }, '');
}

function splitOn(source, { from, to }, operator) {
  const parts = [];
  let start = from;
  for (const { index, group } of forward(source, from)) {
    if (index >= to) {
      break;
    }
    if (!group && source.tokens[index].text === operator) {
      parts.push({ from: start, to: index });
      start = index + 1;
    }
  }
  return [...parts, { from: start, to }];
}

function readsOf(text, { index, owner }) {
  const call = `\\.(?:get|charAt|elementAt)\\(${escape(index)}\\)`;
  return new RegExp(`(?<![\\w.])${escape(owner)}(?:${call}|\\[${escape(index)}\\])`, 'u').test(
    text,
  );
}

function strictCheck(text, { index, owner }) {
  const bound = `${escape(owner)}\\.${LENGTHS}`;
  const strict = `${escape(index)}(?:>=|<)${bound}|${bound}(?:<=|>)${escape(index)}`;
  const moved = `(?<![\\w.])${escape(index)}(?:=(?!=)|[-+*/]=|\\+\\+|--)|(?:\\+\\+|--)${escape(index)}`;
  return new RegExp(`${strict}|${moved}`, 'u').test(text);
}

function branchOf(source, closeParen) {
  const { tokens, partner } = source;
  const start = closeParen + 1;
  if (tokens[start]?.text === '{' && partner[start] > start) {
    return { from: start + 1, to: partner[start], next: partner[start] + 1 };
  }
  const end = statementEnd(source, start);
  return { from: start, to: end, next: tokens[end]?.text === ';' ? end + 1 : end };
}

function leaves(source, { from, to }) {
  return source.tokens.slice(from, to).some(({ text }) => LEAVES.has(text));
}

function ifStatements(source, { from, to }) {
  const { tokens, partner } = source;
  const found = [];
  for (let index = from; index < to; index += 1) {
    const open = index + 1;
    if (tokens[index].text === 'if' && tokens[open]?.text === '(' && partner[open] > open) {
      found.push({ index, open, close: partner[open] });
    }
  }
  return found;
}

function blockEnd(source, index) {
  const open = source.opener[index];
  return open >= 0 ? source.partner[open] : source.tokens.length;
}

function reportFor(source, statement, frameRange) {
  const { tokens } = source;
  const condition = { from: statement.open + 1, to: statement.close };
  const branch = branchOf(source, statement.close);
  const frameText = joined(source, statement.open + 1, frameRange.to);
  const found = [];
  const rejecting = splitOn(source, condition, '||');
  rejecting.forEach((part) => {
    const pair = pairOf(joined(source, part.from, part.to), REJECTING);
    const later = joined(source, part.to, statement.close);
    const after =
      tokens[branch.next]?.text !== 'else' && leaves(source, branch)
        ? joined(source, branch.next, blockEnd(source, statement.index))
        : '';
    if (pair && !strictCheck(frameText, pair) && readsOf(`${later}${after}`, pair)) {
      found.push({
        line: tokens[part.from].line,
        name: pair.index,
        owner: pair.owner,
        rejects: true,
      });
    }
  });
  splitOn(source, condition, '&&').forEach((part) => {
    const pair = pairOf(joined(source, part.from, part.to), ACCEPTING);
    const later = `${joined(source, part.to, statement.close)}${joined(source, branch.from, branch.to)}`;
    if (pair && !strictCheck(frameText, pair) && readsOf(later, pair)) {
      found.push({
        line: tokens[part.from].line,
        name: pair.index,
        owner: pair.owner,
        rejects: false,
      });
    }
  });
  return found;
}

function findIn(source, range, frame) {
  return ifStatements(source, range).flatMap((statement) =>
    reportFor(source, statement, range).map((found) => ({ ...found, method: frame.name })),
  );
}

export const INDEX_BOUND_CHECK = {
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
