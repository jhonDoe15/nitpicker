import type { InvocationFact, ScopeFact, SpringView } from '../../spring/typed/spring-shapes.mts';
import { BUILDERS, MAPPERS, UNBOUNDED_EXECUTORS } from './typed/site-names.mts';
import type { Collection, Frame, Link, SiteLike } from './typed/fan-out-types.mts';

const LOOPS = new Set(['loop', 'foreach']);
const BOUNDARIES = new Set(['fun', 'class', 'object']);
const COROUTINES = new Set(['async', 'launch']);
const FUTURES = new Set(['supplyAsync', 'runAsync']);
const THREADS = new Set(['thread', 'startVirtualThread']);
const EXECUTOR_CALLS = new Set(['submit', 'execute']);
const WAITS = new Set(['await', 'join', 'get', 'getNow', 'resultNow']);
const WINDOWS = new Set(['take', 'takeLast', 'subList', 'slice']);
const CHUNKS = new Set(['chunked', 'windowed']);
const ENUM_VIEWS = new Set(['entries', 'values']);
const SIZE = /\.(?:size|lastIndex|indices|length)\b|\.count\(\)/u;
const SIZE_OWNER = /([\p{L}_][\p{L}\p{N}_.]*?)\s*\.\s*(?:size|lastIndex|indices|length|count\(\))/u;
const LIMITED = /\blimitedParallelism\s*\(/u;
const TYPE_NAME = /^[A-Z][\p{L}\p{N}_.]*$/u;
const IDENTIFIER = /^[\p{L}_][\p{L}\p{N}_]*$/u;
const MAX_LABEL = 50;
const LAMBDA = 'lambda';
const REPEAT = 'repeat';
const DEPTH_STEPS = new Map([
  ['(', 1],
  [')', -1],
  ['[', 1],
  [']', -1],
]);

type Scoped = { view: SpringView; scopeId: number | undefined };

type Frames = { frames: Frame[]; reached: boolean };

function framesUpTo(
  view: SpringView,
  scopeId: number | undefined,
  stop: ScopeFact | undefined,
): Frames {
  const frames: Frame[] = [];
  for (const scope of view.chain(scopeId)) {
    if (scope.id === stop?.id || BOUNDARIES.has(scope.k)) {
      return { frames, reached: scope.id === stop?.id };
    }
    frames.push(scope);
  }
  return { frames, reached: false };
}

function hostCall(view: SpringView, scope: ScopeFact): InvocationFact | undefined {
  return view.file.invocations.find(
    (invocation) =>
      invocation.name === scope.host &&
      invocation.scope === scope.parent &&
      invocation.line === scope.line,
  );
}

function executorKind(view: SpringView, scope: ScopeFact, text: string | undefined): boolean {
  const type = text === undefined ? undefined : view.typeOf(scope.parent, text);
  return type !== undefined && UNBOUNDED_EXECUTORS.has(type);
}

function boundedDispatcher(view: SpringView, scope: ScopeFact, text: string | undefined): boolean {
  return (
    text !== undefined &&
    (LIMITED.test(text) || view.typeOf(scope.parent, text) === 'limitedParallelism')
  );
}

export function starterOf(view: SpringView, scope: ScopeFact): string | undefined {
  if (scope.k !== LAMBDA || scope.host === undefined) {
    return undefined;
  }
  if (COROUTINES.has(scope.host)) {
    return boundedDispatcher(view, scope, scope.argument) ? undefined : scope.host;
  }
  if (FUTURES.has(scope.host)) {
    const executor = hostCall(view, scope)?.arguments.find(
      ({ lambda, text }) => !(lambda || text.startsWith('{')),
    );
    return executor === undefined || executorKind(view, scope, executor.text)
      ? scope.host
      : undefined;
  }
  if (THREADS.has(scope.host)) {
    return scope.host;
  }
  return EXECUTOR_CALLS.has(scope.host) && executorKind(view, scope, scope.qualifier)
    ? scope.host
    : undefined;
}

function isSite(scope: Frame): boolean {
  if (scope.k === LAMBDA) {
    return (
      scope.host !== undefined &&
      ((MAPPERS.has(scope.host) && scope.collection !== undefined) || scope.host === REPEAT)
    );
  }
  return LOOPS.has(scope.k) && scope.collection !== undefined;
}

export function siteOf(view: SpringView, starter: ScopeFact): Frame | undefined {
  const { frames } = framesUpTo(view, starter.parent, undefined);
  return frames.find(isSite);
}

export function waitsInside(view: SpringView, site: ScopeFact, starters: Set<number>): boolean {
  return view.file.invocations.some((invocation) => {
    if (
      !WAITS.has(invocation.name) ||
      (invocation.name === 'get' && invocation.arguments.length === 1)
    ) {
      return false;
    }
    const { frames, reached } = framesUpTo(view, invocation.scope, site);
    return (
      (reached || invocation.scope === site.id) && !frames.some((frame) => starters.has(frame.id))
    );
  });
}

function mentionsSize(
  view: SpringView,
  scopeId: number | undefined,
  text: string | undefined,
): boolean {
  if (text === undefined) {
    return false;
  }
  if (SIZE.test(text)) {
    return true;
  }
  if (!IDENTIFIER.test(text.trim())) {
    return false;
  }
  const local = (view.file.locals ?? []).find(
    (entry) =>
      entry.name === text.trim() && view.chain(scopeId).some(({ id }) => id === entry.scope),
  );
  return (
    local?.alias !== undefined && SIZE.test(`.${local.alias.split('.').at(-1) ?? local.alias}`)
  );
}

function topLevelArguments(text: string): string[] {
  const inner = text.slice(text.indexOf('(') + 1, text.lastIndexOf(')'));
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (const [index, character] of Array.from(inner).entries()) {
    depth += DEPTH_STEPS.get(character) ?? 0;
    if (character === ',' && depth === 0) {
      parts.push(inner.slice(start, index));
      start = index + 1;
    }
  }
  return [...parts, inner.slice(start)];
}

function sizedArgument(view: SpringView, scopeId: number | undefined, text: string): boolean {
  if (!mentionsSize(view, scopeId, text)) {
    return true;
  }
  return (
    /^minOf\(/u.test(text.trim()) &&
    topLevelArguments(text).some((part) => !mentionsSize(view, scopeId, part))
  );
}

function sizedLink({ view, scopeId }: Scoped, link: Link, names: Set<string>): boolean {
  const linkArguments = link.arguments ?? [];
  return (
    names.has(link.name) &&
    linkArguments.length > 0 &&
    linkArguments.every((argument) => sizedArgument(view, scopeId, argument))
  );
}

function declaresParameter(scope: ScopeFact, name: string): boolean {
  return (
    (scope.params ?? []).some((entry) => entry.name === name) ||
    (scope.k === LAMBDA && scope.params === undefined && name === 'it')
  );
}

function chunkVariable(view: SpringView, site: SiteLike, name: string): boolean {
  const outer: Frame | undefined = view
    .chain(site.parent)
    .find((scope) => declaresParameter(scope, name));
  const last = outer?.collection?.links.at(-1);
  return (
    outer !== undefined &&
    last !== undefined &&
    sizedLink({ view, scopeId: outer.parent }, last, CHUNKS)
  );
}

function isBuilder(name: string | undefined): boolean {
  return name !== undefined && BUILDERS.has(name);
}

function fixedName(view: SpringView, site: SiteLike, name: string): boolean {
  if (chunkVariable(view, site, name)) {
    return true;
  }
  const local = (view.file.locals ?? []).findLast(
    (entry) => entry.name === name && view.chain(site.parent).some(({ id }) => id === entry.scope),
  );
  if (local !== undefined) {
    return isBuilder(local.initializer);
  }
  const owner = view.chain(site.parent).find(({ k }) => k === 'class' || k === 'object');
  const property =
    owner === undefined
      ? undefined
      : view.memberPropertiesOf(owner.qualified).find((entry) => entry.name === name);
  return property !== undefined && !property.var && isBuilder(property.initializer);
}

function fixedRoot(view: SpringView, site: SiteLike, collection: Collection): boolean {
  const [first] = collection.links;
  if (collection.root === undefined) {
    return (
      first !== undefined &&
      isBuilder(first.name) &&
      ((first.arguments ?? []).length > 0 || first.name.startsWith('enum'))
    );
  }
  if (collection.range !== undefined) {
    const { from, to } = collection.range;
    return !(mentionsSize(view, site.parent, from) || mentionsSize(view, site.parent, to));
  }
  if (TYPE_NAME.test(collection.root) && first !== undefined && ENUM_VIEWS.has(first.name)) {
    return true;
  }
  return (
    IDENTIFIER.test(collection.root) &&
    !collection.links.some((link) => link.name === 'indices') &&
    fixedName(view, site, collection.root)
  );
}

export function isFixed(view: SpringView, site: SiteLike): boolean {
  if (site.host === REPEAT) {
    return !mentionsSize(view, site.parent, site.argument);
  }
  const { collection } = site;
  if (collection === undefined) {
    return false;
  }
  return (
    collection.links.some((link) => sizedLink({ view, scopeId: site.parent }, link, WINDOWS)) ||
    fixedRoot(view, site, collection)
  );
}

function compact(text: string | undefined): string {
  return (text ?? '').trim().replaceAll(/\s+/gu, ' ');
}

export function collectionLabel(site: Frame): string {
  const text = site.host === REPEAT ? site.argument : (site.qualifier ?? site.range);
  const owner = SIZE_OWNER.exec(text ?? '')?.[1];
  if (
    owner !== undefined &&
    (site.host === REPEAT ||
      site.collection?.range !== undefined ||
      (text ?? '').includes('indices'))
  ) {
    return owner;
  }
  const flat = compact(text);
  return flat.length <= MAX_LABEL ? flat : (site.collection?.root ?? 'the collection');
}
