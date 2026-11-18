import { QUERY_TYPES } from '../data-types.mts';
import { lastSelector, parseSelector, unwrapped } from '../../view/expressions.mts';
import { chainOf, isCollection, loopFrames } from './loop-scopes.mts';
import { escapeRegExp } from '../../../../../../../../shared/paths/glob.mjs';
import type { Argument, InvocationFact, SpringView } from '../../typed/spring-shapes.mts';

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
const CAST = /\sas\??\s+[\p{L}_][\p{L}\p{N}_.<>?, ]*$/u;
const SOURCE_DEPTH = 8;
const QUERY_CREATORS = new Set(['createQuery', 'createNamedQuery', 'createNativeQuery']);
const QUERY_BUILDERS = new Set<string | undefined>([
  ...QUERY_CREATORS,
  'setParameter',
  'setHint',
  'setLockMode',
  'setFlushMode',
  'setFirstResult',
  'setMaxResults',
]);

function singleArgument(values: Argument[]): boolean {
  const [only, ...rest] = values;
  return only !== undefined && rest.length === 0 && !only.spread && !only.lambda;
}

function oneElementCall(invocation: InvocationFact | undefined): boolean {
  return (
    invocation !== undefined &&
    singleArgument(invocation.arguments) &&
    ONE_ELEMENT.has(
      [invocation.receiver, invocation.name]
        .filter((part) => part !== undefined && part !== '')
        .join('.'),
    )
  );
}

function sourceCollection(text: string): string {
  const steps = [text.trim()];
  for (const current of steps) {
    const cast = CAST.exec(current);
    const inner = unwrapped(current) ?? (cast === null ? undefined : current.slice(0, cast.index));
    const parts = inner === undefined ? lastSelector(current) : undefined;
    const call = parts === undefined ? undefined : parseSelector(parts.selector);
    const next =
      inner ?? (call?.call === true && NARROWING.has(call.name) ? parts?.head : undefined);
    if (next === undefined || steps.length > SOURCE_DEPTH) {
      return current;
    }
    steps.push(next.trim());
  }
  return text.trim();
}

export function oneElementSource(view: SpringView, invocation: InvocationFact): boolean {
  const chain = chainOf(view, invocation);
  return (
    chain.length > 0 &&
    chain.slice(0, -1).every(({ name }) => NARROWING.has(name)) &&
    oneElementCall(chain.at(-1))
  );
}

export function oneElement(raw: string): boolean {
  const text = sourceCollection(raw);
  const parts = lastSelector(text);
  const call = parseSelector(parts?.selector ?? text);
  const qualifier = parts === undefined || QUALIFIER.test(parts.head);
  return (
    qualifier &&
    call?.call === true &&
    singleArgument(call.arguments) &&
    ONE_ELEMENT.has(
      [parts?.head, call.name].filter((part) => part !== undefined && part !== '').join('.'),
    )
  );
}

function heldQuery(view: SpringView, invocation: InvocationFact): InvocationFact[] {
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

function queryCalls(view: SpringView, invocation: InvocationFact): InvocationFact[] {
  return [...chainOf(view, invocation), ...heldQuery(view, invocation)];
}

export function loopVariable(
  view: SpringView,
  invocation: InvocationFact,
  text: string | undefined,
): boolean {
  const head = HEAD.exec((text ?? '').trim())?.[0];
  return loopFrames(view, invocation.scope).some((scope) => {
    const params = scope.params ?? [];
    return params.length === 0
      ? scope.k === 'lambda' && head === 'it'
      : params.some(({ name }) => name === head);
  });
}

function listParameter(view: SpringView, text: string, binding: InvocationFact): boolean {
  const [name, value] = binding.arguments;
  const parameter = NAME.exec(name?.text.trim() ?? '')?.[1];
  return (
    parameter !== undefined &&
    new RegExp(String.raw`\b(?:in|any)\s*\(?\s*:${escapeRegExp(parameter)}\b`, 'iu').test(text) &&
    isCollection(view, binding.scope, value?.text) &&
    value !== undefined &&
    !oneElement(value.text)
  );
}

function queryText(view: SpringView, text: string | undefined): string {
  const constant = view.file.properties.find(({ name }) => name === text?.trim());
  return constant?.literalText ?? text ?? '';
}

function chunkUpdate(view: SpringView, invocation: InvocationFact): boolean {
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

export function queryUpdate(view: SpringView, invocation: InvocationFact): boolean {
  return (
    invocation.name === 'executeUpdate' &&
    (QUERY_BUILDERS.has(invocation.previous?.name) ||
      view.is(view.typeOf(invocation.scope, invocation.receiver), QUERY_TYPES)) &&
    !chunkUpdate(view, invocation)
  );
}
