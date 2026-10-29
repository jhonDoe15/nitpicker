import { QUERY_TYPES } from '../data-types.mjs';
import { lastSelector, parseSelector, unwrapped } from '../../view/expressions.mjs';
import { chainOf, isCollection, loopFrames } from './loop-scopes.mjs';

const QUALIFIER = /^[\w.]+$/u;
const NAME = /^"(\w+)"$/u;
const HEAD = /^[\p{L}_][\p{L}\p{N}_]*/u;
const ONE_ELEMENT = new Set([
  'listOf',
  'setOf',
  'mutableListOf',
  'mutableSetOf',
  'arrayListOf',
  'List.of',
  'Set.of',
  'java.util.List.of',
  'java.util.Set.of',
  'singletonList',
  'singleton',
  'Collections.singletonList',
  'Collections.singleton',
  'java.util.Collections.singletonList',
  'java.util.Collections.singleton',
]);
const NARROWING = new Set([
  'filter',
  'filterNot',
  'filterNotNull',
  'filterIsInstance',
  'map',
  'mapNotNull',
  'distinct',
  'sorted',
  'sortedBy',
  'onEach',
  'take',
  'drop',
  'toList',
  'toMutableList',
  'toSet',
  'toMutableSet',
]);
const CAST = /^([\s\S]+?)\s+as\??\s+[\p{L}_][\p{L}\p{N}_.<>?, ]*$/u;
const SOURCE_DEPTH = 8;
const QUERY_CREATORS = new Set(['createQuery', 'createNamedQuery', 'createNativeQuery']);
const QUERY_BUILDERS = new Set([
  ...QUERY_CREATORS,
  'setParameter',
  'setHint',
  'setLockMode',
  'setFlushMode',
  'setFirstResult',
  'setMaxResults',
]);

function singleArgument(values) {
  const [only, ...rest] = values;
  return only !== undefined && rest.length === 0 && only.spread !== true && only.lambda !== true;
}

export function oneElementCall(invocation) {
  return (
    singleArgument(invocation.arguments) &&
    ONE_ELEMENT.has([invocation.receiver, invocation.name].filter(Boolean).join('.'))
  );
}

function sourceCollection(text) {
  const steps = [text.trim()];
  for (const current of steps) {
    const inner = unwrapped(current) ?? CAST.exec(current)?.[1];
    const parts = inner === undefined ? lastSelector(current) : undefined;
    const call = parts === undefined ? undefined : parseSelector(parts.selector);
    const next =
      inner ?? (call?.call === true && NARROWING.has(call.name) ? parts.head : undefined);
    if (next === undefined || steps.length > SOURCE_DEPTH) {
      return current;
    }
    steps.push(next.trim());
  }
  return text.trim();
}

export function oneElementSource(view, invocation) {
  const chain = chainOf(view, invocation);
  return (
    chain.length > 0 &&
    chain.slice(0, -1).every(({ name }) => NARROWING.has(name)) &&
    oneElementCall(chain.at(-1))
  );
}

export function oneElement(raw) {
  const text = sourceCollection(raw);
  const parts = lastSelector(text);
  const call = parseSelector(parts?.selector ?? text);
  const qualifier = parts === undefined || QUALIFIER.test(parts.head);
  return (
    qualifier &&
    call?.call === true &&
    singleArgument(call.arguments) &&
    ONE_ELEMENT.has([parts?.head, call.name].filter(Boolean).join('.'))
  );
}

function heldQuery(view, invocation) {
  const local = view
    .chain(invocation.scope)
    .flatMap(({ id }) =>
      (view.file.locals ?? []).filter(
        (entry) => entry.scope === id && entry.name === invocation.receiver,
      ),
    )[0];
  if (local === undefined) {
    return [];
  }
  const initializer = view.file.invocations.find(
    (entry) =>
      entry.assignedTo === local.name && entry.scope === local.scope && entry.line === local.line,
  );
  const bindings = view.file.invocations.filter(
    (entry) =>
      entry.name === 'setParameter' &&
      entry.receiver === local.name &&
      view.chain(entry.scope).some(({ id }) => id === local.scope),
  );
  return [...chainOf(view, initializer), ...bindings];
}

function queryCalls(view, invocation) {
  return [...chainOf(view, invocation), ...heldQuery(view, invocation)];
}

export function loopVariable(view, invocation, text) {
  const head = HEAD.exec((text ?? '').trim())?.[0];
  return loopFrames(view, invocation.scope).some((scope) =>
    (scope.params ?? []).length === 0
      ? scope.k === 'lambda' && head === 'it'
      : scope.params.some(({ name }) => name === head),
  );
}

function listParameter(view, text, binding) {
  const [name, value] = binding.arguments;
  const parameter = NAME.exec(name?.text.trim() ?? '')?.[1];
  return (
    parameter !== undefined &&
    new RegExp(String.raw`\b(?:in|any)\s*\(?\s*:${parameter}\b`, 'iu').test(text) &&
    isCollection(view, binding.scope, value?.text) &&
    !oneElement(value.text)
  );
}

function queryText(view, text) {
  const constant = (view.file.properties ?? []).find(({ name }) => name === text?.trim());
  return constant?.literalText ?? text ?? '';
}

function chunkUpdate(view, invocation) {
  const calls = queryCalls(view, invocation);
  const text = queryText(
    view,
    calls.find((call) => QUERY_CREATORS.has(call.name))?.arguments[0]?.text,
  );
  const bindings = calls.filter((call) => call.name === 'setParameter');
  return (
    bindings.some((binding) => listParameter(view, text, binding)) &&
    !bindings.some(
      ({ scope, arguments: [, value] }) =>
        !isCollection(view, scope, value?.text) && loopVariable(view, invocation, value?.text),
    )
  );
}

export function queryUpdate(view, invocation) {
  return (
    invocation.name === 'executeUpdate' &&
    (QUERY_BUILDERS.has(invocation.previous?.name) ||
      view.is(view.typeOf(invocation.scope, invocation.receiver), QUERY_TYPES)) &&
    !chunkUpdate(view, invocation)
  );
}
