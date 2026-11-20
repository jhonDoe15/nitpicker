import { forward, startsNewLine } from '../max-value-sums/source/source-file.mts';
import {
  isFullQuery as untypedIsFullQuery,
  queryProblemMessage as untypedMessage,
  queryTextProblem as untypedProblem,
  runTogether as untypedRunTogether,
} from '../../../../../shared/rules/query-text/query-text.mjs';
import { chainFrom, chainText, stringText } from './chains.mts';
import type { ChainOperand } from './chains.mts';
import type { BareSource, SourceFile, Span } from '../max-value-sums/sum-types.mts';
import type { MinedItem, MinedRule, QueryProblem } from '../review-types.mts';

const isFullQuery: (text: string) => boolean = untypedIsFullQuery;
const queryProblemMessage: (problem: QueryProblem) => string = untypedMessage;
const queryTextProblem: (text: string, options: { complete: boolean }) => QueryProblem | undefined =
  untypedProblem;
const runTogether: (left: string, right: string) => QueryProblem | undefined = untypedRunTogether;

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

function statementEnd(
  source: BareSource,
  { from, index, end, group }: { from: number; index: number; end: number; group: boolean },
): number | undefined {
  const { tokens, kotlin } = source;
  const text = tokens[index]?.text ?? '';
  if (text === '{' && group && BLOCK_STARTS.has(tokens[from]?.text ?? '')) {
    return end;
  }
  const ends = kotlin ? index > from && startsNewLine(tokens, index) : text === ';' && !group;
  if (!ends) {
    return undefined;
  }
  return kotlin ? index : end;
}

function nextStatement(source: BareSource, from: number): Span | undefined {
  const { tokens } = source;
  for (const step of forward(source, from)) {
    if (tokens[step.index]?.text === '}' && !step.group) {
      return undefined;
    }
    const to = statementEnd(source, { from, ...step });
    if (to !== undefined) {
      return { from, to };
    }
  }
  return undefined;
}

function assignedName(source: BareSource, start: number): string | undefined {
  const { tokens } = source;
  const operator = tokens[start - 1]?.text;
  const name = tokens[start - 2];
  return (operator === '=' || operator === '+=') && name?.kind === 'identifier'
    ? name.text
    : undefined;
}

function isComplete(
  source: BareSource,
  { start, end, text }: { start: number; end: number; text: string },
): boolean {
  const { tokens } = source;
  const before = tokens[start - 1]?.text;
  if (
    before === '(' &&
    QUERY_CALLS.has(tokens[start - 2]?.text ?? '') &&
    [')', ','].includes(tokens[end]?.text ?? '')
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

function runTogetherPair(
  source: BareSource,
  operand: ChainOperand,
  following: ChainOperand | undefined,
): QueryProblem | undefined {
  const first = source.tokens[operand.from];
  const second = following === undefined ? undefined : source.tokens[following.from];
  if (!(operand.literal && following?.literal) || first === undefined || second === undefined) {
    return undefined;
  }
  return runTogether(
    stringText(first, { kotlin: source.kotlin }),
    stringText(second, { kotlin: source.kotlin }),
  );
}

function adjacent(source: BareSource, operands: ChainOperand[]): QueryProblem | undefined {
  for (const [index, operand] of operands.entries()) {
    const problem = runTogetherPair(source, operand, operands[index + 1]);
    if (problem !== undefined) {
      return problem;
    }
  }
  return undefined;
}

function queryFinding(
  token: { line: number },
  { text, problem }: { text: string; problem: QueryProblem },
): MinedItem {
  return {
    line: token.line,
    kind: problem.kind,
    symbol: problem.kind,
    key: problem.snippet ?? text.slice(0, KEY_LENGTH),
    problem,
  };
}

function queryAt(
  source: BareSource,
  index: number,
): { end: number; finding: MinedItem | undefined } {
  const token = source.tokens[index];
  const { operands, end } = chainFrom(source, index);
  const text = chainText(source, operands);
  const complete = isComplete(source, { start: index, end, text });
  const problem = queryTextProblem(text, { complete }) ?? adjacent(source, operands);
  return {
    end,
    finding:
      problem !== undefined && token !== undefined
        ? queryFinding(token, { text, problem })
        : undefined,
  };
}

export function findMalformedQueries(source: SourceFile): MinedItem[] {
  const { tokens } = source;
  const found: MinedItem[] = [];
  const pending = [0];
  for (const index of pending) {
    if (index >= tokens.length) {
      break;
    }
    if (tokens[index]?.kind !== 'string' || tokens[index - 1]?.text === '+') {
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

export const queryTextRule: MinedRule = {
  id: QUERY_TEXT_RULE,
  find: findMalformedQueries,
  message: ({ problem }) => queryProblemMessage(problem ?? { kind: '' }),
};

export const QUERY_TEXT_ALLOWED = queryProblemMessage({
  kind: 'operand',
  snippet: 'AND group_id LIKE',
});
