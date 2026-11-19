import { fieldOf } from '../../../../../../../shared/values/readers.mts';
import type {
  FunctionFact,
  InvocationFact,
  ScopeFact,
  SpringView,
} from '../../spring/typed/spring-shapes.mts';
import type {
  GlobalFact,
  Located,
  ProjectIndex,
  Reach,
  Region,
  Work,
} from './typed/fan-out-types.mts';
import { acceptsArguments, isSelfCall } from '../../spring/spring-scopes.mts';
import { typeName } from '../../spring/spring-names.mts';
import { callKind, isSemaphoreType, kindOfType } from './clients.mts';
import { appendAll } from '../../../../../../../shared/lists/items.mjs';

const DEPTH = 3;
const BOUNDARIES = new Set(['fun', 'class', 'object']);
const PERMIT_HOSTS = new Set(['withPermit']);
const ACQUIRES = new Set(['acquire']);
const LIMITER_NAME = /(?:permits?|semaphore|limiter|limit|gate)$/iu;
const IDENTIFIER = /^[\p{L}_][\p{L}\p{N}_]*$/u;
const SELF = /^this(?:@[\p{L}_][\p{L}\p{N}_]*)?$/u;

function framesTo(
  view: SpringView,
  scopeId: number | undefined,
  top: ScopeFact,
): ScopeFact[] | undefined {
  const frames: ScopeFact[] = [];
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

function isSemaphore(view: SpringView, invocation: InvocationFact): boolean {
  const type = view.typeOf(invocation.scope, invocation.receiver);
  return type === undefined
    ? LIMITER_NAME.test(invocation.receiver ?? '')
    : isSemaphoreType(view, type);
}

type Site = { view: SpringView; top: ScopeFact; invocation: InvocationFact };

function acquiredBefore({ view, top, invocation }: Site): boolean {
  return view.file.invocations.some(
    (candidate) =>
      ACQUIRES.has(candidate.name) &&
      candidate.line <= invocation.line &&
      framesTo(view, candidate.scope, top) !== undefined &&
      isSemaphore(view, candidate),
  );
}

function guarded(site: Site, frames: ScopeFact[]): boolean {
  return (
    frames.some(({ k, host }) => k === 'lambda' && host !== undefined && PERMIT_HOSTS.has(host)) ||
    acquiredBefore(site)
  );
}

function functionScope(view: SpringView, fn: FunctionFact): ScopeFact | undefined {
  return view.file.scopes.find(
    ({ k, name, line }) => k === 'fun' && name === fn.name && line === fn.line,
  );
}

function matching(fns: FunctionFact[], invocation: InvocationFact): FunctionFact[] {
  return fns.filter(
    (fn) =>
      fn.name === invocation.name &&
      fn.hasBody &&
      (invocation.reference === true || acceptsArguments(fn, invocation.arguments.length)),
  );
}

function ownerOf(view: SpringView, scopeId: number | undefined): string {
  return view.chain(scopeId).find(({ k }) => k === 'class' || k === 'object')?.qualified ?? '';
}

function selfTargets(
  project: ProjectIndex,
  view: SpringView,
  invocation: InvocationFact,
): Located[] {
  const owner = ownerOf(view, invocation.scope);
  const members = matching(view.functionsOf(owner), invocation);
  if (members.length > 0) {
    return members.map((fn) => ({ view, fn }));
  }
  return project
    .topLevel(view, invocation.name)
    .flatMap((found) => matching([found.fn], invocation).map((fn) => ({ view: found.view, fn })));
}

function memberTargets(
  project: ProjectIndex,
  view: SpringView,
  invocation: InvocationFact,
): Located[] {
  const type = view.typeOf(invocation.scope, invocation.receiver);
  const found = type === undefined ? undefined : view.projectClass(typeName(type));
  const target = found === undefined ? undefined : project.viewOf(found.file);
  if (found === undefined || target === undefined) {
    return [];
  }
  const fns = found.file.functions.filter(({ owner }) => owner === found.declared.qualified);
  return matching(fns, invocation).map((fn) => ({ view: target, fn }));
}

function targetsOf(project: ProjectIndex, view: SpringView, invocation: InvocationFact): Located[] {
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

function globalKind(
  project: ProjectIndex,
  view: SpringView,
  invocation: InvocationFact,
): string | undefined {
  const name = invocation.receiver;
  if (
    invocation.assign === true ||
    name === undefined ||
    !IDENTIFIER.test(name) ||
    view.declaresLocally(invocation.scope, name)
  ) {
    return undefined;
  }
  const global = project.global(view, name);
  return global === undefined
    ? undefined
    : kindOfType(global.view, global.type ?? global.initializer, invocation.name);
}

function regionKey(view: SpringView, top: ScopeFact): string {
  return `${view.file.file}:${String(top.id)}`;
}

type Step = { invocation: InvocationFact; bounded: boolean };

function helperRegions(
  project: ProjectIndex,
  region: Region,
  { invocation, bounded }: Step,
): Region[] {
  const { via, depth, visiting } = region;
  return targetsOf(project, region.view, invocation).flatMap((target) => {
    const top = functionScope(target.view, target.fn);
    if (top === undefined) {
      return [];
    }
    const key = regionKey(target.view, top);
    if (visiting.has(key)) {
      return [];
    }
    return [
      {
        view: target.view,
        top,
        depth: depth - 1,
        visiting: new Set([...visiting, key]),
        via: {
          helper: via?.helper ?? invocation.name,
          line: via?.line ?? invocation.line,
          bounded: (via?.bounded ?? false) || bounded,
        },
      },
    ];
  });
}

function regionReaches(project: ProjectIndex, region: Region, pending: Region[]): Reach[] {
  const { view, top, depth, via } = region;
  return view.file.invocations.flatMap((invocation) => {
    const frames = framesTo(view, invocation.scope, top);
    if (frames === undefined) {
      return [];
    }
    const bounded = guarded({ view, top, invocation }, frames);
    const kind = callKind(view, invocation) ?? globalKind(project, view, invocation);
    if (kind !== undefined) {
      const call = `${invocation.receiver ?? ''}.${invocation.name}`;
      return [
        {
          call,
          kind,
          helper: via?.helper,
          bounded: (via?.bounded ?? false) || bounded,
          line: via?.line ?? invocation.line,
        },
      ];
    }
    if (depth > 0) {
      appendAll(pending, helperRegions(project, region, { invocation, bounded }));
    }
    return [];
  });
}

export function remoteWork(
  project: ProjectIndex,
  view: SpringView,
  starter: ScopeFact,
): Work | undefined {
  const pending: Region[] = [
    { view, top: starter, depth: DEPTH, visiting: new Set([regionKey(view, starter)]) },
  ];
  const reaches: Reach[] = [];
  for (const region of pending) {
    appendAll(reaches, regionReaches(project, region, pending));
  }
  const open = reaches.filter(({ bounded }) => !bounded);
  const [first] = open;
  return first === undefined ? undefined : { ...first, lines: open.map(({ line }) => line) };
}

export function referenceWork(
  project: ProjectIndex,
  view: SpringView,
  reference: InvocationFact,
): Work | undefined {
  for (const target of targetsOf(project, view, reference)) {
    const top = functionScope(target.view, target.fn);
    const work = top === undefined ? undefined : remoteWork(project, target.view, top);
    if (work !== undefined) {
      return { ...work, helper: reference.name, lines: [reference.line] };
    }
  }
  return undefined;
}

function isVisible(view: SpringView, declared: GlobalFact): boolean {
  const { package: owner } = declared.view.file;
  return (
    owner === view.file.package ||
    view.file.imports.some(({ path, all }) => path === (all ? owner : `${owner}.${declared.name}`))
  );
}

export function projectIndex(views: SpringView[]): ProjectIndex {
  const byFile = new Map(views.map((view) => [view.file.file, view]));
  const topLevel: Located[] = views.flatMap((view) =>
    view.file.functions
      .filter((fn) => fn.owner === '' && fieldOf(fn, 'local') !== true)
      .map((fn) => ({ view, fn })),
  );
  const globals: GlobalFact[] = views.flatMap((view) =>
    (view.file.globals ?? []).map((declared) => ({ ...declared, view })),
  );
  return {
    global: (view, name) =>
      globals.find((declared) => declared.name === name && isVisible(view, declared)),
    viewOf: (file) => byFile.get(file.file),
    topLevel: (view, name) =>
      topLevel.filter(
        (entry) => entry.fn.name === name && entry.view.file.package === view.file.package,
      ),
  };
}
