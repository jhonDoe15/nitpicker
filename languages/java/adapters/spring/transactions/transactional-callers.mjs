import path from 'node:path';
import { escapeRegExp } from '../../../../../shared/paths/glob.mjs';
import {
  offsetOf,
  pathInside,
  readJavaSource,
  sourceFilesUnder,
} from '../../review-rules/java-sources.mjs';
import { TRANSACTIONAL, prefixOf } from './inherited-transactions.mjs';
import { indexCalls } from './call-sites.mjs';

const BLOCK_BODY = 'block';
const LAMBDA_BODY = 'lambda';
const RULE = 'SpringMultiWriteWithoutTransaction';
const TEST_SOURCES = /(?:^|[/\\])src[/\\]test[/\\]/u;
const ANNOTATIONS = /^\s*(?:@[\w.]+(?:\s*\((?:[^()]|\([^()]*\))*\))?\s*)*/u;
const TRANSACTIONAL_ARGUMENTS = /@(?:[\w.]*\.)?Transactional\b(\s*\((?:[^()]|\([^()]*\))*\))?/u;
const SPRING_OUTSIDE = /\bpropagation\s*=\s*[\w.]*\b(?:NOT_SUPPORTED|NEVER|SUPPORTS)\b/u;
const JAKARTA_OUTSIDE = /\b(?:NOT_SUPPORTED|NEVER|SUPPORTS)\b/u;
const JAKARTA = /\b(?:jakarta|javax)\.transaction\.Transactional\b/u;
const TRANSACTION_TYPES = 'TransactionTemplate|TransactionOperations|TransactionalOperator';
const DECLARED_TEMPLATES = new RegExp(
  String.raw`\b(?:${TRANSACTION_TYPES})(?:\s*<[\w<>?, ]*>)?\s+(\w+)|(\w+)\s*:\s*(?:${TRANSACTION_TYPES})\b`,
  'gu',
);
const CONTROL = new Set([
  'if',
  'for',
  'while',
  'switch',
  'catch',
  'synchronized',
  'try',
  'with',
  'when',
]);
const CONTROL_HEADER = /^(?:else|try|finally|do|static|when|(?:case|default)\b.*)?$/u;
const TYPE_KEYWORD = /\b(?:class|interface|object|enum|record)\s+\w+/u;
const CLOSING = { ')': '(', '}': '{' };
const WRAPPER_LOOKBEHIND = 80;

function beforeIndex(text, index, length) {
  return text.slice(Math.max(0, index - length), index);
}

function skipAnnotations(text, start) {
  return start + (ANNOTATIONS.exec(text.slice(start))?.[0].length ?? 0);
}

function nameAfter(text, start) {
  const skipped = skipAnnotations(text, start);
  const open = text.indexOf('(', skipped);
  if (open < 0) {
    return undefined;
  }
  const name = /([\w$]+)\s*$/u.exec(text.slice(skipped, open));
  return name === null ? undefined : { name: name[1], offset: skipped + name.index, open };
}

function matchingClose(text, open, pair) {
  const [left, right] = pair;
  let depth = 0;
  for (const [index, character] of text.slice(open).split('').entries()) {
    depth += character === left ? 1 : 0;
    depth -= character === right ? 1 : 0;
    if (depth === 0) {
      return open + index;
    }
  }
  return -1;
}

function bodyOf(text, open) {
  const from = matchingClose(text, open, '()');
  const begin = from < 0 ? -1 : text.indexOf('{', from);
  if (begin < 0 || /;/u.test(text.slice(from, begin))) {
    return { begin: open, end: open };
  }
  const end = matchingClose(text, begin, '{}');
  return { begin, end: end < 0 ? text.length : end };
}

function trackDelimiter(stack, character, index) {
  if (character === '(' || character === '{') {
    stack.push({ character, index });
  } else if (Object.hasOwn(CLOSING, character) && stack.at(-1)?.character === CLOSING[character]) {
    stack.pop();
  }
}

function delimiterStacks(text, offsets) {
  const wanted = new Set(offsets);
  const stacks = new Map();
  const stack = [];
  for (const [index, character] of text.split('').entries()) {
    if (wanted.has(index)) {
      stacks.set(index, [...stack]);
    }
    trackDelimiter(stack, character, index);
  }
  return stacks;
}

function kindOf(header, kotlin) {
  const trimmed = header.trim();
  if (/\bnew\s/u.test(trimmed) || (/->/u.test(trimmed) && !/^(?:case|default)\b/u.test(trimmed))) {
    return LAMBDA_BODY;
  }
  if (TYPE_KEYWORD.test(trimmed) && !/\bfun\b/u.test(trimmed)) {
    return 'class';
  }
  const call = /([\w$]+)\s*\([^]*\)\s*(?:throws[^]*)?$/u.exec(trimmed);
  if (/\bfun\b/u.test(trimmed) || (call !== null && !CONTROL.has(call[1]) && !kotlin)) {
    return 'method';
  }
  if (CONTROL_HEADER.test(trimmed) || (call !== null && CONTROL.has(call[1]))) {
    return BLOCK_BODY;
  }
  return kotlin ? LAMBDA_BODY : BLOCK_BODY;
}

function runsIn(header, text) {
  if (!TRANSACTIONAL.test(header)) {
    return undefined;
  }
  const annotation = TRANSACTIONAL_ARGUMENTS.exec(header);
  if (annotation === null) {
    return undefined;
  }
  const jakarta = JAKARTA.test(annotation[0]) || JAKARTA.test(text);
  return !(jakarta ? JAKARTA_OUTSIDE : SPRING_OUTSIDE).test(annotation[1] ?? '');
}

function templateCall(text) {
  const names = [...text.matchAll(DECLARED_TEMPLATES)].map((match) => match[1] ?? match[2]);
  if (names.length === 0) {
    return { test: () => false };
  }
  const receivers = names.map((name) => escapeRegExp(name)).join('|');
  return new RegExp(
    String.raw`\b(?:${receivers})\s*\.\s*(?:execute|executeWithoutResult|transactional)\s*$`,
    'u',
  );
}

function parenStep(state, entry) {
  if (state.call.test(beforeIndex(state.text, entry.index, WRAPPER_LOOKBEHIND))) {
    return !state.crossed;
  }
  state.crossed ||= state.text.slice(entry.index, state.offset).includes('->');
  return undefined;
}

function isCallback(state, header, wrapped) {
  if (state.call.test(header.trimEnd())) {
    return true;
  }
  const wrapper = beforeIndex(state.text, wrapped?.index ?? 0, WRAPPER_LOOKBEHIND);
  return wrapped !== undefined && state.call.test(wrapper);
}

function classStep(state, header) {
  if (state.method === undefined || state.crossed) {
    return false;
  }
  return runsIn(state.method, state.text) ?? runsIn(header, state.text) ?? false;
}

function braceStep(state, entry, wrapped) {
  const header = prefixOf(state.text, entry.index);
  const kind = kindOf(header, state.kotlin);
  if (kind === 'class') {
    return classStep(state, header);
  }
  if (kind === 'method' && state.method === undefined) {
    state.method = header;
  }
  if (kind !== LAMBDA_BODY && kind !== BLOCK_BODY) {
    return undefined;
  }
  if (kind === LAMBDA_BODY && isCallback(state, header, wrapped)) {
    return !state.crossed;
  }
  state.crossed ||= kind === LAMBDA_BODY;
  return undefined;
}

function siteTransactional({ text, stack, offset, reference, call, kotlin }) {
  const state = { text, offset, call, kotlin, crossed: reference, method: undefined };
  const outward = stack.toReversed();
  for (const [position, entry] of outward.entries()) {
    const next = outward[position + 1];
    const wrapped = next?.character === '(' ? next : undefined;
    const decided =
      entry.character === '(' ? parenStep(state, entry) : braceStep(state, entry, wrapped);
    if (decided !== undefined) {
      return decided;
    }
  }
  return false;
}

function sourcesOf(projectRoot, roots) {
  return [...new Set(roots)]
    .flatMap((root) => sourceFilesUnder(pathInside(projectRoot, root), ['.java', '.kt']))
    .filter((file) => !TEST_SOURCES.test(file))
    .map((file) => ({ file: path.resolve(file), text: readJavaSource(file) ?? '' }));
}

function createRun({ projectRoot, roots }) {
  const sources = sourcesOf(projectRoot, roots);
  const texts = new Map(sources.map(({ file, text }) => [file, text]));
  const calls = indexCalls(sources);
  const stacks = new Map();
  const templates = new Map();
  function textOf(file) {
    if (!texts.has(file)) {
      texts.set(file, readJavaSource(file) ?? '');
    }
    return texts.get(file);
  }
  function stackAt(file, offset) {
    if (!stacks.has(file)) {
      const sites = [...calls.values()].flat().filter((site) => site.file === file);
      stacks.set(
        file,
        delimiterStacks(
          textOf(file),
          sites.map((site) => site.offset),
        ),
      );
    }
    return stacks.get(file).get(offset) ?? [];
  }
  function templateOf(file) {
    if (!templates.has(file)) {
      templates.set(file, templateCall(textOf(file)));
    }
    return templates.get(file);
  }
  return { calls, textOf, stackAt, templateOf };
}

function runsInTransactions(finding, run, projectRoot) {
  const file = path.resolve(projectRoot, finding.path);
  const text = run.textOf(file);
  const method = nameAfter(text, offsetOf(text, { line: finding.location?.line ?? 1 }));
  if (method === undefined) {
    return false;
  }
  const body = bodyOf(text, method.open);
  const sites = (run.calls.get(method.name) ?? []).filter(
    (site) => site.file !== file || site.offset < body.begin || site.offset > body.end,
  );
  return (
    sites.length > 0 &&
    sites.every((site) =>
      siteTransactional({
        text: run.textOf(site.file),
        stack: run.stackAt(site.file, site.offset),
        offset: site.offset,
        reference: site.reference,
        call: run.templateOf(site.file),
        kotlin: site.file.endsWith('.kt'),
      }),
    )
  );
}

export function withoutTransactionalCallers(findings, { projectRoot, roots }) {
  const candidates = findings.filter(({ tool, rule }) => tool === 'pmd' && rule === RULE);
  if (candidates.length === 0) {
    return findings;
  }
  const run = createRun({ projectRoot, roots });
  return findings.filter(
    (finding) => !(candidates.includes(finding) && runsInTransactions(finding, run, projectRoot)),
  );
}
