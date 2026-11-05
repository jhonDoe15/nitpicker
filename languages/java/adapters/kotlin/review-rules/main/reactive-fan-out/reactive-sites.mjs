import { isFixed } from '../fan-out/sites.mjs';

const REACTOR_LIMIT = 256;
const OPERATORS = new Set(['flatMap', 'flatMapSequential']);
const SOURCES = new Set(['fromIterable', 'fromStream', 'fromArray']);
const EXTENSIONS = new Set(['toFlux']);
const GROUPS = new Set([
  'buffer',
  'bufferTimeout',
  'bufferUntil',
  'bufferWhile',
  'window',
  'windowTimeout',
  'windowUntil',
  'windowWhile',
  'collectList',
  'collectMap',
  'reduce',
]);
const WINDOWS = new Set(['take', 'limitRequest']);
const SIZE = /\.(?:size|lastIndex|length)\b|\.count\(\)/u;
const ALL_AT_ONCE = new Set(['zip', 'zipDelayError', 'when', 'whenDelayError']);
const UP_TO_LIMIT = new Set(['merge', 'mergeSequential']);
const MAPS = new Set(['map', 'mapNotNull', 'mapIndexed']);
const FLUX = /^(?:reactor\.core\.publisher\.)?Flux$/u;
const PUBLISHER = /^(?:reactor\.core\.publisher\.)?(Mono|Flux)$/u;
const PUBLISHER_TYPE = /^(?:Mono|Flux|Publisher|Flow|ParallelFlux)\b/u;
const UNLIMITED = /\bInt\.MAX_VALUE\b/u;
const BUILDER =
  /^(?:listOf|setOf|arrayOf|listOfNotNull|setOfNotNull|sequenceOf|enumValues|enumEntries)\s*[(<]/u;
const IDENTIFIER = /^[\p{L}_][\p{L}\p{N}_]*$/u;
const REFERENCE = /^(?:[\p{L}_][\p{L}\p{N}_]*)?::([\p{L}_][\p{L}\p{N}_]*)$/u;

function compact(text) {
  return (text ?? '').replaceAll(/\s+/gu, '');
}

function onSameLine(invocation) {
  return (candidate) =>
    candidate.scope === invocation.scope &&
    candidate.line === invocation.line &&
    candidate.name === invocation.name;
}

function takesLambda(invocation) {
  return (invocation.arguments ?? []).some(
    ({ lambda, text }) => lambda || text.trim().startsWith('{'),
  );
}

function lambdaOf(view, invocation) {
  const callers = view.file.invocations.filter(
    (candidate) => onSameLine(invocation)(candidate) && takesLambda(candidate),
  );
  const lambdas = view.file.scopes.filter(
    (scope) =>
      scope.k === 'lambda' &&
      scope.host === invocation.name &&
      scope.parent === invocation.scope &&
      scope.line === invocation.line,
  );
  return lambdas.length === callers.length ? lambdas[callers.indexOf(invocation)] : undefined;
}

export function workerOf(view, invocation) {
  const scope = lambdaOf(view, invocation);
  if (scope !== undefined) {
    return { scope };
  }
  const argument = invocation.arguments?.find(({ lambda }) => !lambda);
  const name = REFERENCE.exec((argument?.text ?? '').trim())?.[1];
  const reference =
    name === undefined
      ? undefined
      : view.file.invocations.find(
          (candidate) =>
            candidate.reference === true &&
            candidate.name === name &&
            candidate.scope === invocation.scope &&
            candidate.line >= invocation.line,
        );
  return reference === undefined ? undefined : { reference };
}

function fixedCollection(view, scopeId, text) {
  const trimmed = text.trim();
  if (BUILDER.test(trimmed)) {
    return true;
  }
  return (
    IDENTIFIER.test(trimmed) &&
    isFixed(view, { parent: scopeId, collection: { root: trimmed, links: [] } })
  );
}

function isSource(view, candidate) {
  if (SOURCES.has(candidate.name)) {
    return FLUX.test(candidate.receiver ?? '') && candidate.arguments?.length === 1;
  }
  if (!EXTENSIONS.has(candidate.name) || candidate.receiver === undefined) {
    return false;
  }
  return !PUBLISHER_TYPE.test(view.typeOf(candidate.scope, candidate.receiver) ?? '');
}

function sourceOf(view, invocation) {
  const receiver = compact(invocation.receiver);
  return view.file.invocations.find(
    (candidate) =>
      candidate.scope === invocation.scope &&
      (candidate.after ?? []).includes(invocation.name) &&
      receiver.startsWith(compact(`${candidate.receiver ?? ''}.${candidate.name}(`)) &&
      isSource(view, candidate),
  );
}

function cutToSize(view, source, name) {
  const prefix = compact(`${source.receiver ?? ''}.${source.name}(`);
  const cut = view.file.invocations.find(
    (candidate) =>
      candidate.name === name &&
      candidate.scope === source.scope &&
      compact(candidate.receiver).startsWith(prefix),
  );
  return (
    cut !== undefined &&
    cut.arguments.length > 0 &&
    cut.arguments.every(({ text }) => !SIZE.test(text))
  );
}

function grouped(view, source, invocation) {
  const after = source.after ?? [];
  return after
    .slice(0, after.indexOf(invocation.name))
    .some((name) => GROUPS.has(name) || (WINDOWS.has(name) && cutToSize(view, source, name)));
}

function operatorSite(view, invocation) {
  if (!OPERATORS.has(invocation.name) || invocation.arguments?.length !== 1) {
    return undefined;
  }
  const source = sourceOf(view, invocation);
  if (source === undefined || grouped(view, source, invocation)) {
    return undefined;
  }
  const collection = SOURCES.has(source.name) ? source.arguments[0].text : source.receiver;
  return fixedCollection(view, invocation.scope, collection)
    ? undefined
    : { form: 'operator', operator: invocation.name, collection, limit: REACTOR_LIMIT, invocation };
}

function flowSite(invocation) {
  const unlimited =
    invocation.name === 'flatMapMerge' &&
    (invocation.arguments ?? []).some(({ lambda, text }) => !lambda && UNLIMITED.test(text));
  return unlimited
    ? {
        form: 'flow',
        operator: 'flatMapMerge(Int.MAX_VALUE)',
        collection: invocation.receiver ?? 'the flow',
        invocation,
      }
    : undefined;
}

function functionOf(view, scopeId) {
  return view.chain(scopeId).find(({ k }) => k === 'fun');
}

function mappedSource(view, invocation, text) {
  const trimmed = text.trim();
  if (IDENTIFIER.test(trimmed)) {
    const owner = functionOf(view, invocation.scope)?.id;
    return view.file.invocations.findLast(
      (candidate) =>
        MAPS.has(candidate.name) &&
        candidate.assignedTo === trimmed &&
        candidate.line <= invocation.line &&
        functionOf(view, candidate.scope)?.id === owner,
    );
  }
  const flat = compact(trimmed);
  return view.file.invocations.find(
    (candidate) =>
      MAPS.has(candidate.name) &&
      candidate.scope === invocation.scope &&
      candidate.line >= invocation.line &&
      candidate.receiver !== undefined &&
      flat.startsWith(compact(`${candidate.receiver}.${candidate.name}`)),
  );
}

function combinatorSite(view, invocation) {
  const type = PUBLISHER.exec(invocation.receiver ?? '')?.[1];
  const known =
    ALL_AT_ONCE.has(invocation.name) ||
    (UP_TO_LIMIT.has(invocation.name) && invocation.arguments?.length === 1);
  const [first] = invocation.arguments ?? [];
  if (type === undefined || !known || first === undefined || first.lambda) {
    return undefined;
  }
  const mapped = mappedSource(view, invocation, first.text);
  if (mapped === undefined || fixedCollection(view, invocation.scope, mapped.receiver)) {
    return undefined;
  }
  return {
    form: 'combinator',
    operator: `${type}.${invocation.name}`,
    collection: mapped.receiver,
    limit: UP_TO_LIMIT.has(invocation.name) && first.spread !== true ? REACTOR_LIMIT : undefined,
    invocation: mapped,
  };
}

export function reactiveSites(view) {
  return view.file.invocations.flatMap((invocation) => {
    const site =
      operatorSite(view, invocation) ?? flowSite(invocation) ?? combinatorSite(view, invocation);
    return site === undefined ? [] : [{ ...site, line: invocation.line, scope: invocation.scope }];
  });
}
