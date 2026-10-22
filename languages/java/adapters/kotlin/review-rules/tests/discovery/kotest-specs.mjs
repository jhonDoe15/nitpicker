import { braceDepths, closingIndex, literalAt, parenDepths } from '../../../scan/kotlin-source.mjs';
import { repeatUntil } from './repeat.mjs';

const REGISTRATIONS = new Set([
  'test',
  'context',
  'describe',
  'it',
  'should',
  'given',
  'when',
  'then',
  'and',
  'feature',
  'scenario',
  'expect',
  'example',
]);
const CALL = /(?<![\w.`])(`?)([A-Za-z]+)\1\s*\(\s*(?=")/gu;
const DATA_CALL = /(?<![\w.`])withData\s*\(/gu;
const AFTER_LITERAL = /^\s*(?:-\s*|(?:[Ss]hould|[Ww]hen|[Gg]iven|[Tt]hen|[Aa]nd)\s+)?(?=\{)/u;
const CONFIG = /^\s*\.\s*config\s*(?=\()/u;
const INIT_BLOCK = /(?<![\w.`])init\s*(?=\{)/gu;
const MAX_CONFIG_CHAIN = 8;

export function isSpecType(name) {
  return name.endsWith('Spec') && name !== 'AnnotationSpec';
}

function parseCallee(name) {
  const lower = name.toLowerCase();
  if (REGISTRATIONS.has(lower)) {
    return { callee: lower, prefix: '' };
  }
  const prefix = name[0];
  const rest = name.slice(1).toLowerCase();
  return (prefix === 'x' || prefix === 'f') && REGISTRATIONS.has(rest)
    ? { callee: rest, prefix }
    : undefined;
}

function viewOf(scanned) {
  const { code } = scanned;
  return { scanned, braces: braceDepths(code), parens: parenDepths(code) };
}

function sameLevel({ braces, parens }, start) {
  return (offset) => braces[offset] === braces[start] && parens[offset] === parens[start];
}

function afterConfig(scanned, from) {
  const { code, source } = scanned;
  const configs = [];
  const state = { at: from };
  repeatUntil(MAX_CONFIG_CHAIN, () => {
    const found = CONFIG.exec(code.slice(state.at));
    if (found === null) {
      return true;
    }
    const open = state.at + found[0].length;
    const close = closingIndex(code, open);
    configs.push(source.slice(open + 1, close));
    state.at = close + 1;
    return false;
  });
  return { configs, at: state.at };
}

function bodyAfter(scanned, from, { allowDash = false } = {}) {
  const { code } = scanned;
  const head = (allowDash ? AFTER_LITERAL : /^\s*(?=\{)/u).exec(code.slice(from));
  if (head === null) {
    return undefined;
  }
  const open = from + head[0].length;
  return { start: open + 1, end: closingIndex(code, open) };
}

function callRegistrations({ scanned }, { start, end, same }) {
  const { code } = scanned;
  return [...code.slice(start, end).matchAll(CALL)].flatMap((match) => {
    const index = start + match.index;
    const parsed = parseCallee(match[2]);
    if (parsed === undefined || !same(index)) {
      return [];
    }
    const open = index + match[0].indexOf('(');
    const { configs, at } = afterConfig(scanned, closingIndex(code, open) + 1);
    const body = bodyAfter(scanned, at);
    const literal = index + match[0].length;
    return body === undefined ? [] : [{ ...parsed, offset: index, literal, configs, body }];
  });
}

function dataRegistrations({ scanned }, { start, end, same }) {
  const { code } = scanned;
  return [...code.slice(start, end).matchAll(DATA_CALL)].flatMap((match) => {
    const index = start + match.index;
    const body = bodyAfter(scanned, closingIndex(code, index + match[0].length - 1) + 1);
    return body === undefined || !same(index)
      ? []
      : [{ callee: 'withData', prefix: '', offset: index, literal: -1, configs: [], body }];
  });
}

function stringRegistrations({ scanned }, { start, end, same }) {
  return scanned.literals
    .filter((literal) => literal.start >= start && literal.end <= end && same(literal.start))
    .flatMap((literal) => {
      const { configs, at } = afterConfig(scanned, literal.end);
      const body = bodyAfter(scanned, at, { allowDash: true });
      const offset = literal.start;
      return body === undefined
        ? []
        : [{ callee: 'string', prefix: '', offset, literal: offset, configs, body }];
    });
}

function registrationsIn(view, range) {
  return [
    ...callRegistrations(view, range),
    ...dataRegistrations(view, range),
    ...stringRegistrations(view, range),
  ].toSorted((left, right) => left.offset - right.offset);
}

export function hasNestedRegistration(scanned, { start, end }) {
  const range = { start, end, same: () => true };
  return registrationsIn(viewOf(scanned), range).length > 0;
}

function nodeOf({ scanned }, found, parent) {
  const name = literalAt(scanned, found.literal)?.text ?? found.callee;
  return {
    callee: found.callee,
    prefix: found.prefix,
    name,
    configs: found.configs,
    offset: found.offset,
    body: found.body,
    parent,
    ancestors: parent === undefined ? [] : [...parent.ancestors, parent.offset],
    path: [...(parent?.path ?? []), name],
  };
}

export function specNodes(scanned, ranges) {
  const view = viewOf(scanned);
  const nodes = [];
  const pending = ranges.map(({ start, end }) => ({ start, end, parent: undefined }));
  for (const item of pending) {
    const same = sameLevel(view, item.start);
    for (const found of registrationsIn(view, { start: item.start, end: item.end, same })) {
      const node = nodeOf(view, found, item.parent);
      nodes.push(node);
      pending.push({ start: node.body.start, end: node.body.end, parent: node });
    }
  }
  const parents = new Set(nodes.map(({ parent }) => parent));
  return nodes
    .toSorted((left, right) => left.offset - right.offset)
    .map((node) => ({ ...node, leaf: !parents.has(node) }));
}

function constructorLambda({ scanned, braces, parens }, call) {
  const { code } = scanned;
  const close = closingIndex(code, call);
  const open = [...code.slice(call + 1, close).matchAll(/\{/gu)]
    .map((match) => call + 1 + match.index)
    .find((index) => braces[index] === braces[call + 1] && parens[index] === parens[call + 1]);
  return open === undefined ? [] : [{ start: open + 1, end: closingIndex(code, open) }];
}

export function specBodies(scanned, klass) {
  const { code } = scanned;
  const view = viewOf(scanned);
  const lambdas = klass.supers
    .filter(({ name, callOpen }) => isSpecType(name) && callOpen >= 0)
    .flatMap(({ callOpen }) => constructorLambda(view, callOpen));
  const inits =
    klass.bodyOpen < 0
      ? []
      : [...code.slice(klass.bodyOpen, klass.bodyClose).matchAll(INIT_BLOCK)]
          .map((match) => klass.bodyOpen + match.index + match[0].length)
          .filter((open) => view.braces[open] === view.braces[klass.bodyOpen] + 1)
          .map((open) => ({ start: open + 1, end: closingIndex(code, open) }));
  return [...lambdas, ...inits];
}
