import { offsetOf, pathInside, readJavaSource } from '../adapters/review-rules/java-sources.mjs';

export const FAN_OUT_RULE = 'UnboundedFanOut';
export const FAN_OUT_LEAD =
  'This loop or stream starts a remote or message call on a new task for every element of a collection at once';
const SCAN_LENGTH = 2000;
const DEPTH = { '(': 1, '{': 1, '[': 1, ')': -1, '}': -1, ']': -1 };
const FOR_EACH = /^\s*for\s*\(/u;
const INDEXED = /^[^;]*;[^;<]*<=?\s*([^;]+?)\s*;/u;
const SIZE_OWNER = /([\w$.()]+?)\s*\.\s*(?:size\s*\(\s*\)|length\b)/u;
const STREAM_SITE =
  /\.\s*(stream|parallelStream|forEach|map|flatMap|mapToObj|invokeAll|invokeAny)\s*\(/gu;
const STREAM_OWNERS = new Set(['Arrays', 'Stream', 'StreamSupport', 'IntStream', 'LongStream']);
const SUBMITTERS = new Set(['invokeAll', 'invokeAny']);
const STATIC_STREAMS = /^(?:Arrays|Stream|StreamSupport)\.(?:stream|of)\((.+)\)$/u;
const RANGES = /^(?:IntStream|LongStream)\.range(?:Closed)?\(/u;
const LEADING = /^(?:.*?(?:\breturn\s+|[^=!<>]=\s*))?/u;
const STARTERS = [
  [/\bsupplyAsync\s*\(/u, 'CompletableFuture.supplyAsync'],
  [/\brunAsync\s*\(/u, 'CompletableFuture.runAsync'],
  [/\bstartVirtualThread\s*\(/u, 'Thread.startVirtualThread'],
  [/\bof(?:Virtual|Platform)\s*\(\s*\)\s*\.\s*start\s*\(/u, 'Thread.Builder.start'],
  [/\bnew\s+Thread\s*\(/u, 'Thread.start'],
  [/\bsendAsync\s*\(/u, 'HttpClient.sendAsync'],
  [/\.\s*submit\s*\(/u, 'ExecutorService.submit'],
  [/\.\s*execute\s*\(/u, 'Executor.execute'],
  [/\.\s*invokeAll\s*\(/u, 'ExecutorService.invokeAll'],
  [/\.\s*invokeAny\s*\(/u, 'ExecutorService.invokeAny'],
];

function isFanOut(finding) {
  return finding.tool === 'pmd' && finding.rule === FAN_OUT_RULE;
}

function compact(text) {
  return text.replaceAll(/\s+/gu, '');
}

function closingOf(text, open) {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    depth += DEPTH[text[index]] ?? 0;
    if (depth === 0) {
      return index;
    }
  }
  return text.length;
}

function statementOf(text) {
  let depth = 0;
  for (const [index, character] of [...text].entries()) {
    depth += DEPTH[character] ?? 0;
    if (depth < 0 || (depth === 0 && (character === ';' || character === '}'))) {
      return text.slice(0, index + 1);
    }
  }
  return text;
}

function sizeOwner(text) {
  return SIZE_OWNER.exec(text)?.[1];
}

function loopCollection(window) {
  const open = window.indexOf('(');
  const header = window.slice(open + 1, closingOf(window, open));
  const indexed = INDEXED.exec(`${header};`);
  if (indexed !== null) {
    return sizeOwner(indexed[1]);
  }
  let depth = 0;
  for (const [index, character] of [...header].entries()) {
    depth += DEPTH[character] ?? 0;
    if (depth === 0 && character === ':') {
      return header.slice(index + 1);
    }
  }
  return undefined;
}

function depthAt(text, end) {
  return [...text.slice(0, end)].reduce((depth, character) => depth + (DEPTH[character] ?? 0), 0);
}

function streamRoot(receiver) {
  const flat = compact(receiver);
  if (RANGES.test(flat)) {
    return sizeOwner(flat) ?? flat;
  }
  return STATIC_STREAMS.exec(flat)?.[1] ?? flat;
}

function streamCollection(window) {
  const sites = [...window.matchAll(STREAM_SITE)]
    .filter((match) => depthAt(window, match.index) === 0)
    .map((match) => ({ match, receiver: window.slice(0, match.index).replace(LEADING, '').trim() }))
    .filter(({ receiver }) => !STREAM_OWNERS.has(compact(receiver)));
  const [site] = sites;
  if (site === undefined || site.receiver === '') {
    return undefined;
  }
  if (SUBMITTERS.has(site.match[1])) {
    const open = site.match.index + site.match[0].length - 1;
    return window.slice(open + 1, closingOf(window, open));
  }
  return streamRoot(site.receiver);
}

function starterOf(window) {
  const found = STARTERS.map(([pattern, name]) => ({ index: pattern.exec(window)?.index, name }))
    .filter(({ index }) => index !== undefined)
    .toSorted((left, right) => left.index - right.index);
  return found[0]?.name;
}

export function fanOutDetail(text, line) {
  const start = offsetOf(text, { line });
  const window = statementOf(text.slice(start, start + SCAN_LENGTH));
  const collection = FOR_EACH.test(window) ? loopCollection(window) : streamCollection(window);
  if (collection === undefined || compact(collection) === '') {
    return undefined;
  }
  const starter = starterOf(window);
  const work =
    starter === undefined ? 'a task that makes a remote or message call' : `\`${starter}\``;
  return `\`${compact(collection)}\` starts ${work} for every element at once`;
}

export function withFanOutDetails(findings, { projectRoot }) {
  if (projectRoot === undefined || !findings.some(isFanOut)) {
    return findings;
  }
  return findings.map((finding) => {
    const line = finding.location?.line;
    if (!isFanOut(finding) || line === undefined || !finding.message.startsWith(FAN_OUT_LEAD)) {
      return finding;
    }
    const text = readJavaSource(pathInside(projectRoot, finding.path));
    const detail = text === undefined ? undefined : fanOutDetail(text, line);
    return detail === undefined
      ? finding
      : { ...finding, message: detail + finding.message.slice(FAN_OUT_LEAD.length) };
  });
}
