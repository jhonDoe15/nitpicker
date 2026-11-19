import { ENTITY_MANAGER, group } from '../../spring-types.mts';
import { elementOf, isCollectionType } from '../../view/member-types.mts';
import { ENTITY_WRITES } from '../data-types.mts';
import type { InvocationFact, ScopeFact, SpringView } from '../../typed/spring-shapes.mts';

export const ITERATING: Set<string | undefined> = group([
  'forEach',
  'forEachIndexed',
  'onEach',
  'onEachIndexed',
  'forEachOrdered',
  'forEachRemaining',
  'repeat',
]);
const MAPPING = new Set<string | undefined>([
  'map',
  'mapIndexed',
  'mapNotNull',
  'mapIndexedNotNull',
  'flatMap',
  'flatMapIndexed',
  'peek',
  'mapToObj',
  'associateWith',
  'associateBy',
  'associate',
  'mapTo',
  'mapNotNullTo',
  'mapIndexedTo',
  'mapIndexedNotNullTo',
  'flatMapTo',
  'associateTo',
  'associateByTo',
  'associateWithTo',
  'mapValues',
  'mapKeys',
]);
const LOOPS = new Set(['loop', 'foreach']);
const CHAIN_LIMIT = 8;
const BOUNDARIES = new Set(['fun', 'class', 'object']);
const COLLECTION_LITERAL =
  /^(?:listOf|setOf|mutableListOf|mutableSetOf|arrayOf|sequenceOf)\(|\.\.|\buntil\b/u;
const COLLECTION_FACTORIES = new Set<string | undefined>([
  'listOf',
  'setOf',
  'mutableListOf',
  'mutableSetOf',
  'arrayListOf',
  'hashSetOf',
  'linkedSetOf',
  'arrayOf',
  'sequenceOf',
  'emptyList',
  'emptySet',
]);
const REFERENCE = /^(?:this\.)?(\w*)::(\w+)$/u;
export const PASS_THROUGH: Set<string | undefined> = group([
  'let',
  'also',
  'run',
  'apply',
  'takeIf',
  'takeUnless',
]);

export function entityReceiver(view: SpringView, invocation: InvocationFact): boolean {
  const type = view.typeOf(invocation.scope, invocation.receiver);
  return type !== undefined && (view.isRepository(type) || view.is(type, ENTITY_MANAGER));
}

export function entityWrite(view: SpringView, invocation: InvocationFact): boolean {
  return ENTITY_WRITES.has(invocation.name) && entityReceiver(view, invocation);
}

export function repositoryReceiver(view: SpringView, invocation: InvocationFact): boolean {
  const type = view.typeOf(invocation.scope, invocation.receiver);
  return type !== undefined && view.isRepository(type);
}

export function isCollection(
  view: SpringView,
  scopeId: number | undefined,
  text: string | undefined,
): boolean {
  if (text === undefined) {
    return false;
  }
  if (COLLECTION_LITERAL.test(text)) {
    return true;
  }
  const type = view.typeOf(scopeId, text);
  return isCollectionType(type) || COLLECTION_FACTORIES.has(type);
}

export function elementIsCollection(
  view: SpringView,
  scopeId: number | undefined,
  text: string | undefined,
): boolean {
  return text !== undefined && isCollectionType(elementOf(view.typeOf(scopeId, text)));
}

function previousCall(view: SpringView, invocation: InvocationFact): InvocationFact | undefined {
  const previous = invocation.previous?.name;
  return view.file.invocations
    .filter(
      (candidate) =>
        previous !== undefined &&
        candidate.name === previous &&
        candidate.scope === invocation.scope &&
        (candidate.after ?? []).includes(invocation.name) &&
        (invocation.receiver ?? '').startsWith(candidate.receiver ?? '\0'),
    )
    .reduce<InvocationFact | undefined>(
      (closest, candidate) =>
        closest === undefined || (candidate.receiver ?? '').length > (closest.receiver ?? '').length
          ? candidate
          : closest,
      undefined,
    );
}

export function chainOf(view: SpringView, start: InvocationFact | undefined): InvocationFact[] {
  const chain = start === undefined ? [] : [start];
  for (const invocation of chain) {
    const previous = previousCall(view, invocation);
    chain.push(...(previous === undefined || chain.length > CHAIN_LIMIT ? [] : [previous]));
  }
  return chain;
}

function overCollection(view: SpringView, start: InvocationFact | undefined): boolean {
  return chainOf(view, start).some((invocation) =>
    isCollection(view, invocation.scope, invocation.receiver),
  );
}

function iteratingCall(view: SpringView, invocation: InvocationFact): boolean {
  return (
    ITERATING.has(invocation.name) ||
    (MAPPING.has(invocation.name) && overCollection(view, invocation))
  );
}

export function hostOf(view: SpringView, scope: ScopeFact): InvocationFact | undefined {
  return view.file.invocations.find(
    ({ name, scope: parent, receiver }) =>
      name === scope.host && parent === scope.parent && receiver === scope.qualifier,
  );
}

function hosted(scope: ScopeFact): boolean {
  return scope.k === 'lambda' || (scope.k === 'fun' && scope.host !== undefined);
}

function iteratingLambda(view: SpringView, scope: ScopeFact): boolean {
  return (
    hosted(scope) &&
    ((scope.host !== undefined && ITERATING.has(scope.host)) ||
      (MAPPING.has(scope.host) &&
        (isCollection(view, scope.parent, scope.qualifier) ||
          overCollection(view, hostOf(view, scope)))))
  );
}

function enclosingFrames(view: SpringView, scopeId: number | undefined): ScopeFact[] {
  const chain = view.chain(scopeId);
  const boundary = chain.findIndex((scope) => BOUNDARIES.has(scope.k) && !hosted(scope));
  return boundary < 0 ? chain : chain.slice(0, boundary);
}

function clearedLoop(view: SpringView, loop: ScopeFact): boolean {
  return view.file.invocations.some(
    (invocation) =>
      invocation.name === 'clear' &&
      view.is(view.typeOf(invocation.scope, invocation.receiver), ENTITY_MANAGER) &&
      view.chain(invocation.scope).some(({ id }) => id === loop.id),
  );
}

export function loopFrames(view: SpringView, scopeId: number | undefined): ScopeFact[] {
  return enclosingFrames(view, scopeId).filter(
    (scope) => LOOPS.has(scope.k) || iteratingLambda(view, scope),
  );
}

export function inLoop(view: SpringView, scopeId: number | undefined): boolean {
  return loopFrames(view, scopeId).some((scope) => !clearedLoop(view, scope));
}

export function inClearedLoop(view: SpringView, scopeId: number | undefined): boolean {
  const [nearest] = loopFrames(view, scopeId);
  return nearest !== undefined && clearedLoop(view, nearest);
}

function localReference(
  view: SpringView,
  invocation: InvocationFact,
  name: string,
): [string, string] | undefined {
  const local = view
    .chain(invocation.scope)
    .flatMap((scope) =>
      (view.file.locals ?? []).filter((entry) => entry.scope === scope.id && entry.name === name),
    )[0];
  const found =
    local === undefined
      ? undefined
      : view.file.invocations.find(
          (entry) =>
            entry.reference === true && entry.scope === local.scope && entry.line === local.line,
        );
  return found === undefined ? undefined : [found.receiver ?? '', found.name];
}

function referenced(
  view: SpringView,
  invocation: InvocationFact,
  text: string,
): [string, string] | undefined {
  const match = REFERENCE.exec(text.trim());
  return match === null
    ? localReference(view, invocation, text.trim())
    : [match[1] ?? '', match[2] ?? ''];
}

function references(view: SpringView, invocation: InvocationFact): InvocationFact[] {
  return iteratingCall(view, invocation) ||
    (PASS_THROUGH.has(invocation.name) && inLoop(view, invocation.scope))
    ? invocation.arguments
        .map(({ text }) => referenced(view, invocation, text))
        .filter((found) => found !== undefined)
        .map(([receiver, name]) => ({
          ...invocation,
          receiver: receiver === '' ? undefined : receiver,
          name,
          arguments: [],
          reference: true,
          host: invocation.name,
          iterated: invocation.receiver,
        }))
    : [];
}

export function referencesInLoops(view: SpringView): InvocationFact[] {
  return view.file.invocations.flatMap((invocation) => references(view, invocation));
}
