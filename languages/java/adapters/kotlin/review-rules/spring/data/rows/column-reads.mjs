import { blankBlocks } from '../../../../../review-rules/java-sources.mjs';
import { typeName } from '../../spring-names.mjs';
import { lambdaParts, normalized } from '../../view/expressions.mjs';
import { simpleName } from '../../view/member-types.mjs';
import { membersOfClass } from '../../view/project-types.mjs';
import { COLUMN_HOLDERS } from '../data-types.mjs';

const HOLDERS = new Set([...COLUMN_HOLDERS].map((fqn) => simpleName(fqn)));
const NEUTRAL_CALLS = new Set([
  'equals',
  'compareTo',
  'isBefore',
  'isAfter',
  'contains',
  'startsWith',
  'endsWith',
  'setOf',
  'listOf',
]);
const COMPARATOR_CALLS = new Set([
  'compareBy',
  'compareByDescending',
  'thenBy',
  'thenByDescending',
  'reversed',
]);
const REJECTED = new Set(['if', 'when', 'val', 'var', 'return', 'as', 'this', 'fun']);
const STRINGS = /"(?:[^"\\]|\\.)*"/gu;
const REFERENCE = /(?<![\w$.])([A-Z][\w$.]*)\s*::\s*([a-z_$][\w$]*)/gu;
const CALL = /(?<![\w$])([A-Za-z_$][\w$]*)\s*(?:<[^<>()]*>\s*)?\(/gu;
const NAME_CHAIN = /(?<![\w$.])([A-Za-z_$][\w$]*)((?:\s*\.\s*[A-Za-z_$][\w$]*)*)/gu;

function isHolder(found) {
  return found.declared.annotations.some(({ type, name }) => HOLDERS.has(simpleName(type ?? name)));
}

function holderOf(view, type) {
  const found = type === undefined ? undefined : view.projectClass(typeName(type));
  return found !== undefined && isHolder(found) ? found : undefined;
}

function storedMembers(found) {
  return membersOfClass(found).filter(
    (member) =>
      member.computed !== true &&
      member.delegated !== true &&
      member.abstract !== true &&
      !(member.annotationEntries ?? []).some(
        ({ type, name }) => simpleName(type ?? name) === 'Transient',
      ),
  );
}

function columnsOf(view, found) {
  const pending = [found];
  const seen = new Set(pending);
  for (const current of pending) {
    const bases = current.declared.supers
      .map((type) => holderOf(view, type))
      .filter((base) => base !== undefined && !seen.has(base));
    for (const base of new Set(bases)) {
      seen.add(base);
      pending.push(base);
    }
  }
  return pending.flatMap((holder) => storedMembers(holder));
}

function readsColumns(view, entity, path) {
  let current = holderOf(view, entity);
  for (const name of path) {
    const member =
      current === undefined ? undefined : columnsOf(view, current).find((m) => m.name === name);
    if (member === undefined) {
      return false;
    }
    current = holderOf(view, member.type?.replace(/\?$/u, ''));
  }
  return true;
}

function referencesColumns(view, entity, text) {
  const references = [...text.matchAll(REFERENCE)];
  return references.every(
    ([, type, name]) =>
      simpleName(type) === simpleName(entity) && readsColumns(view, entity, [name]),
  );
}

function lambdasIn(text) {
  const found = [];
  let depth = 0;
  let start = 0;
  for (const [index, character] of [...text].entries()) {
    if (character === '{' && depth++ === 0) {
      start = index;
    } else if (character === '}' && --depth === 0) {
      found.push(text.slice(start, index + 1));
    }
  }
  return found;
}

function pureBody(view, entity, { params, body }) {
  const code = normalized(body).replaceAll(STRINGS, '""');
  if (code.includes('{') || code.includes('::')) {
    return false;
  }
  const calls = [...code.matchAll(CALL)].map((match) => match[1]);
  if (!calls.every((name) => NEUTRAL_CALLS.has(name))) {
    return false;
  }
  const chains = [...code.matchAll(NAME_CHAIN)].map(([, head, rest]) => ({
    head,
    path: rest
      .split('.')
      .map((part) => part.trim())
      .filter(Boolean),
  }));
  if (chains.some(({ head }) => REJECTED.has(head))) {
    return false;
  }
  const reads = chains.filter(({ head }) => params.includes(head));
  return (
    reads.length > 0 &&
    reads.every(
      ({ path }) =>
        path.length > 0 &&
        readsColumns(
          view,
          entity,
          path.filter((name) => !NEUTRAL_CALLS.has(name)),
        ),
    )
  );
}

export function keyReadsColumns(view, entity, argument) {
  const text = argument?.text?.trim();
  if (text === undefined) {
    return false;
  }
  if (text.startsWith('{')) {
    const parts = lambdaParts(text);
    return parts !== undefined && pureBody(view, entity, parts);
  }
  return /::/u.test(text) && referencesColumns(view, entity, text);
}

export function comparatorReadsColumns(view, entity, argument) {
  const text = argument?.text?.trim() ?? '';
  const outside = blankBlocks(text).replaceAll(REFERENCE, ' ');
  const calls = [...outside.matchAll(CALL)].map((match) => match[1]);
  const lambdas = lambdasIn(text);
  const words = outside.match(/[A-Za-z_$][\w$]*/gu) ?? [];
  return (
    calls.length > 0 &&
    words.every((word) => COMPARATOR_CALLS.has(word) || word === simpleName(entity)) &&
    (lambdas.length > 0 || text.includes('::')) &&
    lambdas.every((lambda) => keyReadsColumns(view, entity, { text: lambda })) &&
    referencesColumns(view, entity, text)
  );
}
