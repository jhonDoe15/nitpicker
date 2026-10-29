import { acceptsArguments, isSelfCall } from '../../spring/spring-scopes.mjs';
import { typeName } from '../../spring/spring-names.mjs';
import { SEMAPHORES, callKind, kindOfType } from './clients.mjs';

const DEPTH = 3;
const BOUNDARIES = new Set(['fun', 'class', 'object']);
const PERMIT_HOSTS = new Set(['withPermit']);
const ACQUIRES = new Set(['acquire']);
const LIMITER_NAME = /(?:permits?|semaphore|limiter|limit|gate)$/iu;
const IDENTIFIER = /^[\p{L}_][\p{L}\p{N}_]*$/u;
const SELF = /^this(?:@[\p{L}_][\p{L}\p{N}_]*)?$/u;

function framesTo(view, scopeId, top) {
  const frames = [];
  for (const scope of view.chain(scopeId)) {
    if (scope.id === top.id) {
      return frames;
    }
    if (BOUNDARIES.has(scope.k)) {
      return undefined;
    }
    frames.push(scope);
  }
  return undefined;
}

function isSemaphore(view, invocation) {
  const type = view.typeOf(invocation.scope, invocation.receiver);
  return type === undefined
    ? LIMITER_NAME.test(invocation.receiver ?? '')
    : view.is(type, SEMAPHORES);
}

function acquiredBefore(view, top, invocation) {
  return view.file.invocations.some(
    (candidate) =>
      ACQUIRES.has(candidate.name) &&
      candidate.line <= invocation.line &&
      framesTo(view, candidate.scope, top) !== undefined &&
      isSemaphore(view, candidate),
  );
}

function guarded(view, top, invocation, frames) {
  return (
    frames.some(({ k, host }) => k === 'lambda' && PERMIT_HOSTS.has(host)) ||
    acquiredBefore(view, top, invocation)
  );
}

function functionScope(view, fn) {
  return view.file.scopes.find(
    ({ k, name, line }) => k === 'fun' && name === fn.name && line === fn.line,
  );
}

function matching(fns, invocation) {
  return fns.filter(
    (fn) =>
      fn.name === invocation.name &&
      fn.hasBody !== false &&
      (invocation.reference === true || acceptsArguments(fn, invocation.arguments.length)),
  );
}

function ownerOf(view, scopeId) {
  return view.chain(scopeId).find(({ k }) => k === 'class' || k === 'object')?.qualified ?? '';
}

function selfTargets(project, view, invocation) {
  const owner = ownerOf(view, invocation.scope);
  const members = matching(view.functionsOf(owner), invocation);
  if (members.length > 0) {
    return members.map((fn) => ({ view, fn }));
  }
  return project
    .topLevel(view, invocation.name)
    .flatMap((found) => matching([found.fn], invocation).map((fn) => ({ view: found.view, fn })));
}

function memberTargets(project, view, invocation) {
  const type = view.typeOf(invocation.scope, invocation.receiver);
  const found = type === undefined ? undefined : view.projectClass(typeName(type));
  const target = found === undefined ? undefined : project.viewOf(found.file);
  if (target === undefined) {
    return [];
  }
  const fns = found.file.functions.filter(({ owner }) => owner === found.declared.qualified);
  return matching(fns, invocation).map((fn) => ({ view: target, fn }));
}

function targetsOf(project, view, invocation) {
  if (invocation.assign === true || invocation.index === true) {
    return [];
  }
  if (invocation.reference === true) {
    return invocation.receiver === undefined || SELF.test(invocation.receiver)
      ? selfTargets(project, view, invocation)
      : [];
  }
  return isSelfCall(view, invocation)
    ? selfTargets(project, view, invocation)
    : memberTargets(project, view, invocation);
}

function globalKind(project, view, invocation) {
  const name = invocation.receiver;
  if (
    invocation.assign === true ||
    !IDENTIFIER.test(name ?? '') ||
    view.declaresLocally(invocation.scope, name)
  ) {
    return undefined;
  }
  const global = project.global(view, name);
  return global === undefined
    ? undefined
    : kindOfType(global.view, global.type ?? global.initializer, invocation.name);
}

function reachesOf(project, view, top, depth, visiting) {
  return view.file.invocations.flatMap((invocation) => {
    const frames = framesTo(view, invocation.scope, top);
    if (frames === undefined) {
      return [];
    }
    const bounded = guarded(view, top, invocation, frames);
    const kind = callKind(view, invocation) ?? globalKind(project, view, invocation);
    if (kind !== undefined) {
      const call = `${invocation.receiver}.${invocation.name}`;
      return [{ call, kind, bounded, line: invocation.line }];
    }
    if (depth === 0) {
      return [];
    }
    return targetsOf(project, view, invocation).flatMap((target) =>
      helperReaches(project, target, depth - 1, visiting).map((reach) => ({
        ...reach,
        helper: invocation.name,
        bounded: bounded || reach.bounded,
        line: invocation.line,
      })),
    );
  });
}

function helperReaches(project, { view, fn }, depth, visiting) {
  const key = `${view.file.file}:${fn.name}:${String(fn.line)}`;
  const scope = functionScope(view, fn);
  if (scope === undefined || visiting.has(key)) {
    return [];
  }
  return reachesOf(project, view, scope, depth, new Set([...visiting, key]));
}

export function remoteWork(project, view, starter) {
  const reaches = reachesOf(project, view, starter, DEPTH, new Set());
  const open = reaches.filter(({ bounded }) => !bounded);
  return open.length === 0 ? undefined : { ...open[0], lines: open.map(({ line }) => line) };
}

export function projectIndex(views) {
  const byFile = new Map(views.map((view) => [view.file.file, view]));
  const topLevel = views.flatMap((view) =>
    view.file.functions
      .filter(({ owner, local }) => owner === '' && local !== true)
      .map((fn) => ({ view, fn })),
  );
  const globals = views.flatMap((view) =>
    (view.file.globals ?? []).map((declared) => ({ ...declared, view })),
  );
  const visible = (view, declared) =>
    declared.view.file.package === view.file.package ||
    view.file.imports.some(
      ({ path, all }) =>
        path ===
        (all ? declared.view.file.package : `${declared.view.file.package}.${declared.name}`),
    );
  return {
    global: (view, name) =>
      globals.find((declared) => declared.name === name && visible(view, declared)),
    viewOf: (file) => byFile.get(file.file),
    topLevel: (view, name) =>
      topLevel.filter(
        (entry) => entry.fn.name === name && entry.view.file.package === view.file.package,
      ),
  };
}
