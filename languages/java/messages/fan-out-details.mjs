import { offsetOf, pathInside, readJavaSource } from '../adapters/review-rules/java-sources.mjs';

export const FAN_OUT_RULE = 'UnboundedFanOut';
export const FAN_OUT_LEAD =
  'This loop or stream starts a remote or message call on a new task for every element of a collection at once';
const SCAN_LENGTH = 2000;
const DEPTH = { '(': 1, '{': 1, '[': 1, ')': -1, '}': -1, ']': -1 };
const NAME = String.raw`[A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*(?:\s*\(\s*\))?)*`;
const COLLECTIONS = [
  new RegExp(String.raw`^\s*for\s*\([^:;()]*?[\w$>\]]\s+[\w$]+\s*:\s*(${NAME})\s*\)`, 'u'),
  new RegExp(
    String.raw`^\s*for\s*\([^;]*;\s*[\w$]+\s*<=?\s*(${NAME}?)\s*\.\s*(?:size\s*\(\s*\)|length)`,
    'u',
  ),
  new RegExp(String.raw`(${NAME}?)\s*\.\s*(?:stream|parallelStream)\s*\(\s*\)`, 'u'),
  new RegExp(String.raw`(${NAME}?)\s*\.\s*forEach\s*\(`, 'u'),
];
const STARTERS = [
  [/\bsupplyAsync\s*\(/u, 'CompletableFuture.supplyAsync'],
  [/\brunAsync\s*\(/u, 'CompletableFuture.runAsync'],
  [/\bstartVirtualThread\s*\(/u, 'Thread.startVirtualThread'],
  [/\bsendAsync\s*\(/u, 'HttpClient.sendAsync'],
  [/\.\s*submit\s*\(/u, 'ExecutorService.submit'],
  [/\.\s*execute\s*\(/u, 'Executor.execute'],
];

function isFanOut(finding) {
  return finding.tool === 'pmd' && finding.rule === FAN_OUT_RULE;
}

function compact(text) {
  return text.replaceAll(/\s+/gu, '');
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

export function fanOutDetail(text, line) {
  const start = offsetOf(text, { line });
  const window = statementOf(text.slice(start, start + SCAN_LENGTH));
  const collection = COLLECTIONS.map((pattern) => pattern.exec(window)?.[1]).find(Boolean);
  if (collection === undefined) {
    return undefined;
  }
  const starter = STARTERS.find(([pattern]) => pattern.test(window))?.[1];
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
