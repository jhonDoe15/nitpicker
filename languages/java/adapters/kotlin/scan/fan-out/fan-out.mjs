import { closingIndex } from '../kotlin-source.mjs';
import {
  BOUND,
  MEMBER_CALL,
  callKind,
  functionBodies,
  importsOf,
  isBounded,
  receiverType,
  remoteCall,
} from './clients.mjs';

const MAPPERS = 'map|mapNotNull|mapIndexed|flatMap|forEach|forEachIndexed|onEach';
const SCOPE = new RegExp(String.raw`\.\s*(?:${MAPPERS})\s*\{|\bfor\s*\(`, 'g');
const STARTER =
  /(?<![\w.])(?:[\w.]+\s*\.\s*)?(async|launch|supplyAsync|runAsync)\s*(\((?:[^()]|\([^()]*\))*\))?\s*\{/g;
const WAITS = /\.\s*(?:await|join)\s*\(\s*\)/;
const FIXED =
  /\b(?:listOf|setOf|arrayOf|mapOf|listOfNotNull|chunked|windowed|take|subList|enumValues)\s*[(<]|\.entries\b|\.values\s*\(\s*\)|^\d+\s*(?:\.\.|until)\s*\d+$/;
const FOR_HEADER = /^\s*\(\s*(?:\(([^)]*)\)|([A-Za-z_]\w*))(?:\s*:[^)]*?)?\s+in\s+/;
const LAMBDA_PARAMETERS = /^\{\s*([\w\s,()]*?)\s*->/;
const CONSEQUENCE =
  'at once, with no bound on how many run together, so a large collection exhausts connections, rate limits or the remote service.';
const ADVICE =
  'Bound it: take a permit around each call (`val permits = Semaphore(8)` created once, then `permits.withPermit { send(it) }`), work through fixed-size chunks (`items.chunked(20).forEach { chunk -> chunk.map { async { send(it) } }.awaitAll() }`), use `flatMapMerge(concurrency = 8)` on a flow,, run blocking calls on `Dispatchers.IO.limitedParallelism(8)`, or send one batch request when the API has one. A limit constant that no semaphore or dispatcher uses bounds nothing.';
export const FAN_OUT_MESSAGES = {
  UnboundedFanOut: `This starts a remote or message call for every element of a collection ${CONSEQUENCE} ${ADVICE}`,
};
function blockOf(code, open) {
  return { open, close: closingIndex(code, open) };
}

const CHAIN_END =
  /(?:[A-Za-z_]\w*\s*(?:\((?:[^()]|\([^()]*\))*\)|\[[^[\]]*\])?\s*(?:\?|!!)?\s*\.\s*)*[A-Za-z_]\w*\s*(?:\((?:[^()]|\([^()]*\))*\)|\[[^[\]]*\])?\s*$/;
const LOOKBACK = 300;
function receiverBefore(code, end) {
  const before = code.slice(Math.max(0, end - LOOKBACK), end);
  const chain = CHAIN_END.exec(before);
  if (chain === null) {
    return { text: '', start: end };
  }
  const leading = chain[0].length - chain[0].trimStart().length;
  return { text: chain[0].trim(), start: end - chain[0].length + leading };
}

function forScope(code, match) {
  const headerOpen = match.index + match[0].length - 1;
  const headerClose = closingIndex(code, headerOpen);
  const header = code.slice(headerOpen, headerClose);
  const parsed = FOR_HEADER.exec(header);
  const brace = /^\s*\{/.exec(code.slice(headerClose + 1));
  if (parsed === null || brace === null) {
    return undefined;
  }
  const variables = (parsed[1] ?? parsed[2]).split(',').map((name) => name.trim());
  const block = blockOf(code, headerClose + brace[0].length);
  return {
    ...block,
    start: match.index,
    collection: header.slice(parsed[0].length).trim(),
    variables,
  };
}

function lambdaScope(code, match) {
  const block = blockOf(code, match.index + match[0].length - 1);
  const parameters = LAMBDA_PARAMETERS.exec(code.slice(block.open));
  const variables = parameters === null ? ['it'] : parameters[1].split(/[\s,()]+/).filter(Boolean);
  const receiver = receiverBefore(code, match.index);
  return { ...block, start: receiver.start, collection: receiver.text, variables };
}

function scopesOf(code) {
  return [...code.matchAll(SCOPE)]
    .map((match) => (match[0].startsWith('for') ? forScope(code, match) : lambdaScope(code, match)))
    .filter((scope) => scope !== undefined && scope.collection !== '');
}

function isFixed(scope, scopes, code) {
  if (FIXED.test(scope.collection)) {
    return true;
  }
  const root = /^[A-Za-z_]\w*/.exec(scope.collection)?.[0];
  const outer = scopes.find(
    (other) =>
      other.open < scope.open && scope.open < other.close && other.variables.includes(root),
  );
  if (outer !== undefined) {
    return FIXED.test(outer.collection);
  }
  const declared = [
    ...code.matchAll(new RegExp(String.raw`\b(?:val|var)\s+${root}\s*=([^\n]*)`, 'g')),
  ];
  return declared.length > 0 && declared.every((match) => FIXED.test(match[1]));
}

function innermost(scopes, offset) {
  return scopes
    .filter((scope) => scope.open < offset && offset < scope.close)
    .reduce(
      (best, scope) => (best === undefined || scope.open > best.open ? scope : best),
      undefined,
    );
}

function startersOf(code, scopes, file) {
  return [...code.matchAll(STARTER)].flatMap((match) => {
    const scope = innermost(scopes, match.index);
    const task = blockOf(code, match.index + match[0].length - 1);
    const body = code.slice(task.open, task.close);
    const found = scope === undefined ? undefined : remoteCall(body, file);
    return found === undefined
      ? []
      : [{ scope, task, found, starter: match[1], options: match[2] ?? '' }];
  });
}

function limitedDispatcher(options, code) {
  return (
    [...options.matchAll(/[A-Za-z_]\w*/g)].some(([name]) =>
      new RegExp(
        String.raw`\b(?:val|var)\s+${name}\s*(?::[^=\n]*)?=[^\n]*\blimitedParallelism\s*\(`,
      ).test(code),
    ) || BOUND.test(options)
  );
}

function waitsOutsideTasks(code, scope, tasks) {
  let text = code.slice(scope.open, scope.close);
  for (const task of tasks.toReversed()) {
    text = text.slice(0, task.open - scope.open) + text.slice(task.close + 1 - scope.open);
  }
  return WAITS.test(text);
}

function fanOutSites(scanned) {
  const { code } = scanned;
  const file = { code, imports: importsOf(code), functions: functionBodies(code) };
  const scopes = scopesOf(code);
  const starters = startersOf(code, scopes, file).filter(
    ({ task, scope, options }) =>
      !limitedDispatcher(options, code) &&
      !isBounded(code.slice(task.open, task.close), file) &&
      !isBounded(code.slice(scope.open, scope.close), file),
  );
  return scopes.flatMap((scope) => {
    const own = starters.filter((starter) => starter.scope === scope).map(({ task }) => task);
    const first = starters.find((starter) => starter.scope === scope);
    if (
      first === undefined ||
      isFixed(scope, scopes, code) ||
      waitsOutsideTasks(code, scope, own)
    ) {
      return [];
    }
    return [{ ...first, tasks: own }];
  });
}

function compact(text) {
  return text.replaceAll(/\s+/g, '');
}

export function fanOutCallOffsets(scanned) {
  const { code } = scanned;
  const file = { code, imports: importsOf(code), functions: functionBodies(code) };
  const offsets = startersOf(code, scopesOf(code), file).flatMap(({ task }) =>
    [...code.slice(task.open, task.close).matchAll(MEMBER_CALL)]
      .filter(([, receiver, method]) => {
        const spec = receiverType(code, receiver, file.imports);
        return spec !== undefined && callKind(spec, method) !== undefined;
      })
      .map((match) => task.open + match.index + match[0].indexOf(match[1])),
  );
  return new Set(offsets);
}

function work({ call, helper, kind }) {
  const reached = `\`${call}\` (a ${kind} call)`;
  return helper === undefined ? reached : `\`${helper}\`, which reaches ${reached},`;
}

export function unboundedFanOut(scanned) {
  return fanOutSites(scanned).map(({ scope, found, starter }) => ({
    rule: 'UnboundedFanOut',
    offset: scope.start,
    subject: `${scope.collection} ${starter} ${found.helper ?? found.call}`,
    message: `\`${starter}\` starts ${work(found)} for every element of \`${compact(scope.collection)}\` ${CONSEQUENCE} ${ADVICE}`,
  }));
}
