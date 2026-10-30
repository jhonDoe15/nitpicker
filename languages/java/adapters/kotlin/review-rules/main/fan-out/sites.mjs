const MAPPERS = new Set([
  'map',
  'mapNotNull',
  'mapIndexed',
  'mapIndexedNotNull',
  'flatMap',
  'forEach',
  'forEachIndexed',
  'onEach',
  'associate',
  'associateBy',
  'associateWith',
  'mapTo',
  'mapNotNullTo',
  'mapIndexedTo',
  'flatMapTo',
  'associateTo',
  'associateByTo',
  'associateWithTo',
]);
const LOOPS = new Set(['loop', 'foreach']);
const BOUNDARIES = new Set(['fun', 'class', 'object']);
const COROUTINES = new Set(['async', 'launch']);
const FUTURES = new Set(['supplyAsync', 'runAsync']);
const THREADS = new Set(['thread', 'startVirtualThread']);
const EXECUTOR_CALLS = new Set(['submit', 'execute']);
const UNBOUNDED_EXECUTORS = new Set([
  'newCachedThreadPool',
  'newVirtualThreadPerTaskExecutor',
  'newThreadPerTaskExecutor',
  'commonPool',
]);
const WAITS = new Set(['await', 'join', 'get', 'getNow', 'resultNow']);
const BUILDERS = new Set([
  'listOf',
  'setOf',
  'mapOf',
  'arrayOf',
  'listOfNotNull',
  'setOfNotNull',
  'sequenceOf',
  'intArrayOf',
  'longArrayOf',
  'enumValues',
  'enumEntries',
]);
const WINDOWS = new Set(['take', 'takeLast', 'subList', 'slice']);
const CHUNKS = new Set(['chunked', 'windowed']);
const ENUM_VIEWS = new Set(['entries', 'values']);
const SIZE = /\.(?:size|lastIndex|indices|length)\b|\.count\(\)/u;
const SIZE_OWNER = /([\p{L}_][\p{L}\p{N}_.]*?)\s*\.\s*(?:size|lastIndex|indices|length|count\(\))/u;
const LIMITED = /\blimitedParallelism\s*\(/u;
const TYPE_NAME = /^[A-Z][\p{L}\p{N}_.]*$/u;
const IDENTIFIER = /^[\p{L}_][\p{L}\p{N}_]*$/u;
const MAX_LABEL = 50;

function framesUpTo(view, scopeId, stop) {
  const frames = [];
  for (const scope of view.chain(scopeId)) {
    if (scope.id === stop?.id || BOUNDARIES.has(scope.k)) {
      return { frames, reached: scope.id === stop?.id };
    }
    frames.push(scope);
  }
  return { frames, reached: false };
}

function hostCall(view, scope) {
  return view.file.invocations.find(
    (invocation) =>
      invocation.name === scope.host &&
      invocation.scope === scope.parent &&
      invocation.line === scope.line,
  );
}

function executorKind(view, scope, text) {
  return text !== undefined && UNBOUNDED_EXECUTORS.has(view.typeOf(scope.parent, text));
}

function boundedDispatcher(view, scope, text) {
  return (
    text !== undefined &&
    (LIMITED.test(text) || view.typeOf(scope.parent, text) === 'limitedParallelism')
  );
}

export function starterOf(view, scope) {
  if (scope.k !== 'lambda') {
    return undefined;
  }
  if (COROUTINES.has(scope.host)) {
    return boundedDispatcher(view, scope, scope.argument) ? undefined : scope.host;
  }
  if (FUTURES.has(scope.host)) {
    const executor = hostCall(view, scope)?.arguments.find(
      ({ lambda, text }) => !lambda && !text.startsWith('{'),
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

function isSite(scope) {
  if (scope.k === 'lambda') {
    return (MAPPERS.has(scope.host) && scope.collection !== undefined) || scope.host === 'repeat';
  }
  return LOOPS.has(scope.k) && scope.collection !== undefined;
}

export function siteOf(view, starter) {
  const { frames } = framesUpTo(view, starter.parent, undefined);
  return frames.find(isSite);
}

export function waitsInside(view, site, starters) {
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

function mentionsSize(view, scopeId, text) {
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
  return local?.alias !== undefined && SIZE.test(`.${local.alias.split('.').at(-1)}`);
}

function topLevelArguments(text) {
  const inner = text.slice(text.indexOf('(') + 1, text.lastIndexOf(')'));
  const parts = [];
  let depth = 0;
  let start = 0;
  for (const [index, character] of [...inner].entries()) {
    depth += { '(': 1, ')': -1, '[': 1, ']': -1 }[character] ?? 0;
    if (character === ',' && depth === 0) {
      parts.push(inner.slice(start, index));
      start = index + 1;
    }
  }
  return [...parts, inner.slice(start)];
}

function sizedArgument(view, scopeId, text) {
  if (!mentionsSize(view, scopeId, text)) {
    return true;
  }
  return (
    /^minOf\(/u.test(text.trim()) &&
    topLevelArguments(text).some((part) => !mentionsSize(view, scopeId, part))
  );
}

function sizedLink({ view, scopeId }, link, names) {
  return (
    names.has(link.name) &&
    (link.arguments ?? []).length > 0 &&
    link.arguments.every((argument) => sizedArgument(view, scopeId, argument))
  );
}

function declaresParameter(scope, name) {
  return (
    (scope.params ?? []).some((entry) => entry.name === name) ||
    (scope.k === 'lambda' && scope.params === undefined && name === 'it')
  );
}

function chunkVariable(view, site, name) {
  const outer = view.chain(site.parent).find((scope) => declaresParameter(scope, name));
  const last = outer?.collection?.links.at(-1);
  return last !== undefined && sizedLink({ view, scopeId: outer.parent }, last, CHUNKS);
}

function fixedName(view, site, name) {
  if (chunkVariable(view, site, name)) {
    return true;
  }
  const local = (view.file.locals ?? []).findLast(
    (entry) => entry.name === name && view.chain(site.parent).some(({ id }) => id === entry.scope),
  );
  if (local !== undefined) {
    return BUILDERS.has(local.initializer);
  }
  const owner = view.chain(site.parent).find(({ k }) => k === 'class' || k === 'object');
  const property =
    owner === undefined
      ? undefined
      : view.memberPropertiesOf(owner.qualified).find((entry) => entry.name === name);
  return property !== undefined && property.var !== true && BUILDERS.has(property.initializer);
}

function fixedRoot(view, site, collection) {
  const [first] = collection.links;
  if (collection.root === undefined) {
    return (
      BUILDERS.has(first?.name) && (first.arguments.length > 0 || first.name.startsWith('enum'))
    );
  }
  if (collection.range !== undefined) {
    const { from, to } = collection.range;
    return !mentionsSize(view, site.parent, from) && !mentionsSize(view, site.parent, to);
  }
  if (TYPE_NAME.test(collection.root) && ENUM_VIEWS.has(first?.name)) {
    return true;
  }
  return (
    IDENTIFIER.test(collection.root) &&
    !collection.links.some((link) => link.name === 'indices') &&
    fixedName(view, site, collection.root)
  );
}

export function isFixed(view, site) {
  if (site.host === 'repeat') {
    return !mentionsSize(view, site.parent, site.argument);
  }
  const { collection } = site;
  return (
    collection.links.some((link) => sizedLink({ view, scopeId: site.parent }, link, WINDOWS)) ||
    fixedRoot(view, site, collection)
  );
}

function compact(text) {
  return (text ?? '').trim().replaceAll(/\s+/gu, ' ');
}

export function collectionLabel(site) {
  const text = site.host === 'repeat' ? site.argument : (site.qualifier ?? site.range);
  const owner = SIZE_OWNER.exec(text ?? '')?.[1];
  if (
    owner !== undefined &&
    (site.host === 'repeat' || site.collection?.range !== undefined || /indices/u.test(text))
  ) {
    return owner;
  }
  const flat = compact(text);
  return flat.length <= MAX_LABEL ? flat : (site.collection?.root ?? 'the collection');
}
