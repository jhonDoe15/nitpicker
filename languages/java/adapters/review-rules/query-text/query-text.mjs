import { forward, startsNewLine } from '../max-value-sums/source-file.mjs';
import {
  isFullQuery,
  queryProblemMessage,
  queryTextProblem,
  runTogether,
} from '../../../../../shared/rules/query-text/query-text.mjs';
import { chainFrom, chainText, stringText } from './chains.mjs';

export const QUERY_TEXT_RULE = 'MalformedQueryText';
export const QUERY_TEXT_EXCEPTION_RULE = `pmd/${QUERY_TEXT_RULE}`;

const QUERY_CALLS = new Set([
  'query',
  'queryForList',
  'queryForObject',
  'queryForMap',
  'queryForRowSet',
  'update',
  'batchUpdate',
  'execute',
  'prepareStatement',
  'prepareCall',
  'createNativeQuery',
  'createQuery',
  'executeQuery',
  'executeUpdate',
  'nativeQuery',
  'format',
  'sql',
]);
const KEY_LENGTH = 40;
const BLOCK_STARTS = new Set(['if', 'for', 'while', 'try', 'synchronized', 'switch', 'when']);

function statementEnd(source, { from, index, end, group }) {
  const { tokens, kotlin } = source;
  const { text } = tokens[index];
  if (text === '{' && group && BLOCK_STARTS.has(tokens[from].text)) {
    return end;
  }
  const ends = kotlin ? index > from && startsNewLine(tokens, index) : text === ';' && !group;
  if (!ends) {
    return undefined;
  }
  return kotlin ? index : end;
}

function nextStatement(source, from) {
  const { tokens } = source;
  for (const step of forward(source, from)) {
    if (tokens[step.index].text === '}' && !step.group) {
      return undefined;
    }
    const to = statementEnd(source, { from, ...step });
    if (to !== undefined) {
      return { from, to };
    }
  }
  return undefined;
}

function assignedName(source, start) {
  const { tokens } = source;
  const operator = tokens[start - 1]?.text;
  const name = tokens[start - 2];
  return (operator === '=' || operator === '+=') && name?.kind === 'identifier'
    ? name.text
    : undefined;
}

function isComplete(source, { start, end, text }) {
  const { tokens } = source;
  const before = tokens[start - 1]?.text;
  if (
    before === '(' &&
    QUERY_CALLS.has(tokens[start - 2]?.text) &&
    [')', ','].includes(tokens[end]?.text)
  ) {
    return true;
  }
  if (before === 'return') {
    return isFullQuery(text);
  }
  const name = assignedName(source, start);
  const next =
    name === undefined
      ? undefined
      : nextStatement(source, tokens[end]?.text === ';' ? end + 1 : end);
  return (
    next !== undefined && !tokens.slice(next.from, next.to).some((token) => token.text === name)
  );
}

function runTogetherPair(source, operand, following) {
  if (!(operand.literal && following?.literal)) {
    return undefined;
  }
  const left = stringText(source.tokens[operand.from], source.kotlin);
  const right = stringText(source.tokens[following.from], source.kotlin);
  return runTogether(left, right);
}

function adjacent(source, operands) {
  for (const [index, operand] of operands.entries()) {
    const problem = runTogetherPair(source, operand, operands[index + 1]);
    if (problem !== undefined) {
      return problem;
    }
  }
  return undefined;
}

function queryFinding(token, { text, problem }) {
  return {
    line: token.line,
    kind: problem.kind,
    symbol: problem.kind,
    key: problem.snippet ?? text.slice(0, KEY_LENGTH),
    problem,
  };
}

function queryAt(source, index) {
  const token = source.tokens[index];
  const { operands, end } = chainFrom(source, index);
  const text = chainText(source, operands);
  const complete = isComplete(source, { start: index, end, text });
  const problem = queryTextProblem(text, { complete }) ?? adjacent(source, operands);
  return { end, finding: problem && queryFinding(token, { text, problem }) };
}

export function findMalformedQueries(source) {
  const { tokens } = source;
  const found = [];
  const pending = [0];
  for (const index of pending) {
    if (index >= tokens.length) {
      break;
    }
    if (tokens[index].kind !== 'string' || tokens[index - 1]?.text === '+') {
      pending.push(index + 1);
      continue;
    }
    const { end, finding } = queryAt(source, index);
    if (finding !== undefined) {
      found.push(finding);
    }
    pending.push(end);
  }
  return found;
}

export const queryTextRule = {
  id: QUERY_TEXT_RULE,
  find: findMalformedQueries,
  message: ({ problem }) => queryProblemMessage(problem),
};

export const QUERY_TEXT_ALLOWED = queryProblemMessage({
  kind: 'operand',
  snippet: 'AND group_id LIKE',
});
