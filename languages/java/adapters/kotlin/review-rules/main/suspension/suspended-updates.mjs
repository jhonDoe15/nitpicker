import { suspendsAt, viewOf } from './suspend-calls.mjs';

export const SUSPENDED_UPDATE_RULE = 'NonAtomicUpdateAcrossSuspension';

const LAUNCHERS = new Set(['launch', 'async']);
const THIS_PREFIX = /^this\./u;

function message(call, target) {
  return `\`${target}\` is updated from a value read before \`${call}()\` suspends: another coroutine can change it meanwhile, and this write then overwrites that change. Call \`${call}()\` into a local first (\`val delta = ${call}()\`, then update \`${target}\`), or hold one Mutex around the whole read-modify-write (\`mutex.withLock { ... }\`).`;
}

function enclosing(update) {
  const scopes = update.scopes;
  return {
    klass: scopes.find(({ k }) => k === 'class'),
    method: scopes.find(({ k }) => k === 'fun')?.name,
    lambdas: scopes.filter(({ k }) => k === 'lambda'),
  };
}

function isLocalProperty(qualifier, update) {
  return qualifier !== undefined && (update.properties ?? []).includes(qualifier);
}

function companionsOf(klass, view) {
  return view.classes
    .filter(
      ({ kind, qualified }) => kind === 'companion' && qualified.startsWith(`${klass.qualified}.`),
    )
    .map(({ qualified }) => qualified);
}

function gateProperty(qualifier, update, { file, view, klass }) {
  const name = qualifier?.replace(THIS_PREFIX, '');
  if (name === undefined || isLocalProperty(qualifier, update)) {
    return undefined;
  }
  const owners = klass === undefined ? [] : [klass.qualified];
  if (klass !== undefined && !THIS_PREFIX.test(qualifier)) {
    owners.push(...companionsOf(klass, view));
  }
  const member = file.properties.find(
    (declared) => owners.includes(declared.owner) && declared.name === name,
  );
  if (member !== undefined || THIS_PREFIX.test(qualifier)) {
    return member;
  }
  return (file.topLevelProperties ?? []).find((declared) => declared.name === name);
}

function singlePermit(qualifier, update, site) {
  const property = gateProperty(qualifier, update, site);
  return property?.initializer === 'Semaphore' && !property.var && property.argument === '1';
}

function lockHeld(lambdas, update, site) {
  for (const { host, qualifier } of lambdas) {
    if (LAUNCHERS.has(host)) {
      return false;
    }
    if (host === 'withLock' && !isLocalProperty(qualifier, update)) {
      return true;
    }
    if (host === 'withPermit' && singlePermit(qualifier, update, site)) {
      return true;
    }
  }
  return false;
}

function memberVariable(update, { file, view, klass }) {
  if (klass === undefined) {
    return undefined;
  }
  const property = file.properties.find(
    ({ owner, name }) => owner === klass.qualified && name === update.target,
  );
  if (property !== undefined) {
    return property.var && !property.delegated;
  }
  const parameter = view.classes
    .find(({ qualified }) => qualified === klass.qualified)
    ?.primaryParameters.find(({ name }) => name === update.target);
  return parameter?.property ? parameter.property === 'var' : undefined;
}

function isSharedVariable(update, site) {
  if (update.locals.includes(update.target) && !update.viaThis) {
    return false;
  }
  const member = memberVariable(update, site);
  if (member !== undefined) {
    return member;
  }
  const topLevel = (site.file.topLevelProperties ?? []).find(({ name }) => name === update.target);
  return !update.viaThis && topLevel?.var === true && !topLevel.delegated;
}

function readsTargetBefore(update, calls) {
  const first = update.value.indexOf(calls[0]);
  return update.value
    .slice(0, first)
    .some((item) => item.k === 'read' && item.name === update.target);
}

function staleInside(update, calls) {
  if (calls.length === 0) {
    return false;
  }
  return update.operator !== '=' || (!update.branching && readsTargetBefore(update, calls));
}

const NO_SOURCE = Object.freeze({ reads: [], call: undefined });

function isLocalRead(item, update) {
  return item.k === 'read' && !item.viaThis && (update.properties ?? []).includes(item.name);
}

function isSharedRead(item, update) {
  return item.viaThis || !update.locals.includes(item.name);
}

function suspendCalls(value, { update, site }) {
  return value.filter((item) => suspendsAt(item, update, site));
}

function suspendAll(state, call) {
  for (const [name, entry] of state.saved) {
    state.saved.set(name, { ...entry, call: entry.call ?? call });
  }
}

function readSource(state, item, { first, later }) {
  if (item.k !== 'read') {
    return NO_SOURCE;
  }
  if (isLocalRead(item, state.update)) {
    const entry = state.saved.get(item.name);
    return entry === undefined ? NO_SOURCE : { reads: [...entry.reads], call: entry.call ?? first };
  }
  if (!isSharedRead(item, state.update)) {
    return NO_SOURCE;
  }
  return { reads: [item.name], call: later };
}

function sourcesOf(state, value, calls) {
  const first = calls[0]?.name;
  const parts = value.map((item, index) => {
    const later = calls.find((found) => value.indexOf(found) > index)?.name;
    return readSource(state, item, { first, later });
  });
  return {
    reads: new Set(parts.flatMap(({ reads }) => reads)),
    call: parts.find(({ call }) => call !== undefined)?.call,
    underLock: state.locked,
  };
}

function extendsPrevious(step, previous) {
  return step.assign !== undefined && step.operator !== '=' && previous !== undefined;
}

function accumulated(sources, previous, fallback) {
  return {
    reads: new Set([...sources.reads, ...previous.reads]),
    call: sources.call ?? previous.call ?? fallback,
    underLock: sources.underLock,
  };
}

function applyStep(state, step) {
  if (step.lock !== undefined) {
    suspendAll(state, step.lock);
    state.locked = true;
    return;
  }
  const calls = suspendCalls(step.value, state);
  const sources = sourcesOf(state, step.value, calls);
  const previous = state.saved.get(step.assign);
  if (calls.length > 0) {
    suspendAll(state, calls[0].name);
  }
  for (const name of step.writes) {
    state.saved.delete(name);
  }
  const name = step.local ?? step.assign;
  if (name !== undefined) {
    const saved = extendsPrevious(step, previous)
      ? accumulated(sources, previous, calls[0]?.name)
      : sources;
    state.saved.set(name, saved);
  }
}

function savedStaleCall(update, site, held) {
  const state = { update, site, saved: new Map(), locked: false };
  for (const step of update.steps ?? []) {
    applyStep(state, step);
  }
  const calls = suspendCalls(update.value, state);
  return update.value
    .filter((item) => isLocalRead(item, update))
    .map((item) => state.saved.get(item.name))
    .filter((entry) => entry?.reads.has(update.target) && !(held && entry.underLock))
    .map((entry) => entry.call ?? calls[0]?.name)
    .find((call) => call !== undefined);
}

function staleCall(update, site, held) {
  const calls = suspendCalls(update.value, { update, site });
  if (!held && staleInside(update, calls)) {
    return calls[0].name;
  }
  return savedStaleCall(update, site, held);
}

export function suspendedUpdateFindings(files, { finding, declaredIn }) {
  const view = viewOf(declaredIn);
  return files.flatMap((file) =>
    (file.updates ?? []).flatMap((update) => {
      const { klass, method, lambdas } = enclosing(update);
      const site = { file, view, klass };
      if (!isSharedVariable(update, site)) {
        return [];
      }
      const call = staleCall(update, site, lockHeld(lambdas, update, site));
      if (call === undefined) {
        return [];
      }
      const owner = memberVariable(update, site) === undefined ? '' : `${klass.qualified}.`;
      return [
        finding({
          rule: SUSPENDED_UPDATE_RULE,
          file: file.file,
          line: update.line,
          symbol: `${owner}${update.target} in ${method ?? '<init>'}`,
          message: message(call, update.target),
        }),
      ];
    }),
  );
}
