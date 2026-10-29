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

class SavedReads {
  constructor(update, suspends) {
    this.update = update;
    this.suspends = suspends;
    this.saved = new Map();
    this.locked = false;
  }

  isLocal(item) {
    return !item.viaThis && (this.update.properties ?? []).includes(item.name);
  }

  isShared(item) {
    return item.viaThis || !this.update.locals.includes(item.name);
  }

  suspendAll(call) {
    for (const [name, entry] of this.saved) {
      this.saved.set(name, { ...entry, call: entry.call ?? call });
    }
  }

  sourcesOf(value, calls) {
    const reads = new Set();
    let call;
    value.forEach((item, index) => {
      if (item.k !== 'read') {
        return;
      }
      const entry = this.isLocal(item) ? this.saved.get(item.name) : undefined;
      entry?.reads.forEach((name) => reads.add(name));
      call ??= entry === undefined ? undefined : (entry.call ?? calls[0]?.name);
      if (!this.isLocal(item) && this.isShared(item)) {
        reads.add(item.name);
        call ??= calls.find((found) => value.indexOf(found) > index)?.name;
      }
    });
    return { reads, call, underLock: this.locked };
  }

  step(step) {
    if (step.lock !== undefined) {
      this.suspendAll(step.lock);
      this.locked = true;
      return;
    }
    const calls = step.value.filter(this.suspends);
    const sources = this.sourcesOf(step.value, calls);
    const previous = this.saved.get(step.assign);
    if (calls.length > 0) {
      this.suspendAll(calls[0].name);
    }
    for (const name of step.writes) {
      this.saved.delete(name);
    }
    const name = step.local ?? step.assign;
    if (name === undefined) {
      return;
    }
    if (step.assign !== undefined && step.operator !== '=' && previous !== undefined) {
      previous.reads.forEach((read) => sources.reads.add(read));
      sources.call ??= previous.call ?? calls[0]?.name;
    }
    this.saved.set(name, sources);
  }

  staleCall(held) {
    for (const step of this.update.steps ?? []) {
      this.step(step);
    }
    const calls = this.update.value.filter(this.suspends);
    for (const item of this.update.value) {
      const entry = item.k === 'read' && this.isLocal(item) ? this.saved.get(item.name) : undefined;
      if (entry?.reads.has(this.update.target) && !(held && entry.underLock)) {
        const call = entry.call ?? calls[0]?.name;
        if (call !== undefined) {
          return call;
        }
      }
    }
    return undefined;
  }
}

function staleCall(update, site, held) {
  const suspends = (item) => suspendsAt(item, update, site);
  const calls = update.value.filter(suspends);
  if (!held && staleInside(update, calls)) {
    return calls[0].name;
  }
  return new SavedReads(update, suspends).staleCall(held);
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
