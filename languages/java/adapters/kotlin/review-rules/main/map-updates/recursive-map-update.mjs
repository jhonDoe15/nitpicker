import { springViews } from '../../spring/view/spring-view.mjs';

export const RECURSIVE_MAP_UPDATE_RULE = 'RecursiveMapUpdate';

const COMPUTES = new Set(['computeIfAbsent', 'compute', 'computeIfPresent', 'merge']);
const GET_OR_PUT = 'getOrPut';
const WRITES = new Set([
  ...COMPUTES,
  GET_OR_PUT,
  'put',
  'putAll',
  'putIfAbsent',
  'remove',
  'clear',
  'replace',
  'replaceAll',
  'set',
  'plusAssign',
  'minusAssign',
]);
const VIEW_WRITES = new Set([
  'remove',
  'removeIf',
  'removeAll',
  'retainAll',
  'clear',
  'minusAssign',
]);
const VIEW = /^(.+)\.(?:keys|values|entries)$/u;
const SELF = /^this(?:@[\p{L}_][\p{L}\p{N}_]*)?\.(.+)$/u;
const SPACE = /\s+/gu;
const IDENTIFIER = /^[\p{L}_][\p{L}\p{N}_]*$/u;
const CONCURRENT = /^(?:java\.util\.concurrent\.)?Concurrent(?:Hash|SkipList)?Map\b/u;
const BOUNDARIES = new Set(['fun', 'class', 'object']);
const OWNERS = new Set(['class', 'object']);
const MEMBER = 'member';

function message(map, host) {
  const allowed = `\`${map}.computeIfAbsent(key) { start(it) }.whenComplete { r, _ -> ${map}.remove(key, r) }\``;
  const effect =
    host === GET_OR_PUT
      ? `\`getOrPut\` stores the value only after the function returns, so a change made inside it is lost or undone.`
      : 'A ConcurrentHashMap then throws IllegalStateException (Recursive update) or deadlocks, and a HashMap throws ConcurrentModificationException.';
  return [
    `Change \`${map}\` after \`${map}.${host}\` returns, not inside the function passed to it`,
    `or a callback or same-class function that function starts: build the value there and attach the cleanup to the result (${allowed}).`,
    effect,
  ].join(' ');
}

function mapRef(text) {
  if (text === undefined) {
    return undefined;
  }
  const compact = text.replaceAll(SPACE, '');
  const self = SELF.exec(compact);
  const name = self === null ? compact : self[1];
  return IDENTIFIER.test(name) ? { name, member: self !== null } : undefined;
}

function written(invocation) {
  const viewed = VIEW.exec((invocation.receiver ?? '').replaceAll(SPACE, ''));
  if (viewed !== null) {
    return VIEW_WRITES.has(invocation.name) ? mapRef(viewed[1]) : undefined;
  }
  return WRITES.has(invocation.name) ? mapRef(invocation.receiver) : undefined;
}

function binding(view, scopeId, ref) {
  if (ref.member) {
    return MEMBER;
  }
  const declaring = view
    .chain(scopeId)
    .find(
      (scope) =>
        view.declaresLocally(scope.id, ref.name) &&
        (scope.parent === undefined || !view.declaresLocally(scope.parent, ref.name)),
    );
  return declaring === undefined ? MEMBER : declaring.id;
}

function computeHost(view, scopeId, { name, receiver }) {
  if (COMPUTES.has(name)) {
    return name;
  }
  const type = name === GET_OR_PUT ? view.typeOf(scopeId, receiver) : undefined;
  return CONCURRENT.test(type ?? '') ? name : undefined;
}

function callbacksAround(view, scopeId) {
  const found = [];
  for (const scope of view.chain(scopeId)) {
    if (BOUNDARIES.has(scope.k)) {
      return found;
    }
    const host =
      scope.k === 'lambda'
        ? computeHost(view, scope.parent, { name: scope.host, receiver: scope.qualifier })
        : undefined;
    const map = mapRef(scope.qualifier);
    if (host !== undefined && map !== undefined) {
      found.push({ host, map, key: binding(view, scope.parent, map) });
    }
  }
  return found;
}

function boundaryOf(view, scopeId) {
  return view.chain(scopeId).find(({ k }) => BOUNDARIES.has(k));
}

function memberWrites(view, funScope) {
  return view.file.invocations.flatMap((invocation) => {
    const ref = written(invocation);
    return ref !== undefined &&
      boundaryOf(view, invocation.scope)?.id === funScope.id &&
      binding(view, invocation.scope, ref) === MEMBER
      ? [ref.name]
      : [];
  });
}

function helperWrites(view, invocation) {
  if (invocation.receiver !== undefined && invocation.receiver !== 'this') {
    return [];
  }
  const owner = view.chain(invocation.scope).find(({ k }) => OWNERS.has(k));
  return view
    .functionsOf(owner?.qualified ?? '')
    .filter((fn) => fn.name === invocation.name)
    .map((fn) =>
      view.file.scopes.find(
        ({ k, name, line }) => k === 'fun' && name === fn.name && line === fn.line,
      ),
    )
    .filter((scope) => scope !== undefined)
    .flatMap((scope) => memberWrites(view, scope));
}

function referencedBy(view, invocation) {
  const reference = new RegExp(String.raw`^(?:this)?::${invocation.name}$`, 'u');
  return view.file.invocations
    .filter(
      (call) =>
        call.scope === invocation.scope &&
        call.line === invocation.line &&
        call.arguments.some(({ text }) => reference.test(text.replaceAll(SPACE, ''))),
    )
    .flatMap((call) => {
      const host = computeHost(view, call.scope, call);
      const map = mapRef(call.receiver);
      return host === undefined || map === undefined
        ? []
        : [{ host, map, key: binding(view, call.scope, map) }];
    });
}

function hit(view, invocation) {
  const ref = written(invocation);
  if (ref !== undefined) {
    const key = binding(view, invocation.scope, ref);
    return callbacksAround(view, invocation.scope).find(
      (callback) => callback.map.name === ref.name && callback.key === key,
    );
  }
  const callbacks = invocation.reference
    ? referencedBy(view, invocation)
    : callbacksAround(view, invocation.scope);
  const members = callbacks.filter(({ key }) => key === MEMBER);
  if (members.length === 0) {
    return undefined;
  }
  const changed = new Set(helperWrites(view, invocation));
  return members.find((callback) => changed.has(callback.map.name));
}

function findingsOf(view, finding) {
  return view.file.invocations.flatMap((invocation) => {
    const callback = hit(view, invocation);
    if (callback === undefined) {
      return [];
    }
    const owner = boundaryOf(view, invocation.scope)?.name ?? '';
    return [
      finding({
        rule: RECURSIVE_MAP_UPDATE_RULE,
        file: view.file.file,
        line: invocation.line,
        symbol: `${owner}.${callback.map.name}`,
        message: message(callback.map.name, callback.host),
      }),
    ];
  });
}

export function recursiveMapUpdateFindings(files, { finding, declaredIn = files }) {
  return springViews({ files, projectFiles: declaredIn, projectRoot: '', javaRoots: [] }).flatMap(
    (view) => findingsOf(view, finding),
  );
}
