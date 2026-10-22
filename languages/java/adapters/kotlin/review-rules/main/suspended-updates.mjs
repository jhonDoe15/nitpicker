import { bareType, importsFrom, simpleTypeName } from '../kotlin-facts.mjs';

export const SUSPENDED_UPDATE_RULE = 'NonAtomicUpdateAcrossSuspension';

const KOTLINX = 'kotlinx.coroutines';
const KOTLINX_FUNCTIONS = new Set([
  'withContext',
  'withTimeout',
  'withTimeoutOrNull',
  'coroutineScope',
  'supervisorScope',
  'awaitAll',
]);
const KOTLINX_METHODS = new Map([
  ['Deferred', new Set(['await'])],
  ['CompletableDeferred', new Set(['await'])],
  ['Channel', new Set(['receive'])],
  ['ReceiveChannel', new Set(['receive'])],
  ['Flow', new Set(['first', 'single', 'last', 'count', 'fold', 'reduce'])],
  ['StateFlow', new Set(['first', 'single', 'last', 'count', 'fold', 'reduce'])],
  ['SharedFlow', new Set(['first', 'single', 'last', 'count', 'fold', 'reduce'])],
]);
const LOCK_HOSTS = new Set(['withLock', 'withPermit']);
const SUSPEND = 'suspend';

function message(call, target) {
  return `\`${target}\` is updated from a value read before \`${call}()\` suspends: another coroutine can change it meanwhile, and this write then overwrites that change. Call \`${call}()\` into a local first (\`val delta = ${call}()\`, then update \`${target}\`), or hold one Mutex around the whole read-modify-write (\`mutex.withLock { ... }\`).`;
}

function allSuspend(functions) {
  return functions.length > 0 && functions.every(({ modifiers }) => modifiers.includes(SUSPEND));
}

function importsKotlinx(file, name, subpackage = '') {
  const prefix = `${KOTLINX}${subpackage}`;
  return file.imports.some(
    ({ path, all }) => path === `${prefix}.${name}` || (all && path === prefix),
  );
}

class View {
  constructor(files) {
    this.files = files;
    this.functions = files.flatMap((file) =>
      file.functions.map((declared) => ({ ...declared, package: file.package })),
    );
    this.classes = files.flatMap((file) => file.classes);
  }

  members(owner, name) {
    return this.functions.filter((declared) => declared.owner === owner && declared.name === name);
  }

  named(name) {
    return this.functions.filter((declared) => declared.name === name);
  }

  classNamed(name) {
    const matches = this.classes.filter((declared) => declared.name === name);
    return matches.length === 1 ? matches[0] : undefined;
  }
}

function enclosing(update) {
  const scopes = update.scopes;
  return {
    klass: scopes.find(({ k }) => k === 'class'),
    method: scopes.find(({ k }) => k === 'fun')?.name,
    locked: scopes.some(({ k, host }) => k === 'lambda' && LOCK_HOSTS.has(host)),
  };
}

function declaredType(name, update, file, view, klass) {
  const method = enclosing(update).method;
  const parameters = view.functions
    .filter((declared) => declared.name === method && declared.owner === (klass?.qualified ?? ''))
    .flatMap((declared) => declared.parameters)
    .filter((parameter) => parameter.name === name);
  if (parameters.length > 0) {
    return new Set(parameters.map(({ type }) => type)).size === 1 ? parameters[0].type : undefined;
  }
  if (update.locals.includes(name) || klass === undefined) {
    return undefined;
  }
  const constructor = view.classes
    .find(({ qualified }) => qualified === klass.qualified)
    ?.primaryParameters.find((parameter) => parameter.name === name && parameter.property);
  const property = file.properties.find(
    (declared) => declared.owner === klass.qualified && declared.name === name,
  );
  return constructor?.type ?? property?.type;
}

function suspendsThroughType(call, type, file, view) {
  const simple = simpleTypeName(type);
  const projectClass = view.classNamed(simple);
  if (projectClass !== undefined) {
    return allSuspend(view.members(projectClass.qualified, call));
  }
  const methods = KOTLINX_METHODS.get(simple);
  const subpackage = simple.endsWith('Flow') ? '.flow' : '';
  return (
    methods?.has(call) === true &&
    (importsKotlinx(file, simple, subpackage) || importsFrom(file, `${KOTLINX}${subpackage}.`))
  );
}

function suspendsWithoutReceiver(call, file, view, klass) {
  const own = klass === undefined ? [] : view.members(klass.qualified, call);
  if (own.length > 0) {
    return allSuspend(own);
  }
  const named = view.named(call);
  if (KOTLINX_FUNCTIONS.has(call)) {
    return named.length === 0 && importsKotlinx(file, call);
  }
  const topLevel = named.filter(({ owner }) => owner === '');
  const withoutSupertypes = klass === undefined || klass.supers.length === 0;
  return (
    withoutSupertypes &&
    named.length === topLevel.length &&
    topLevel.every(({ package: packageName }) => packageName === file.package) &&
    allSuspend(topLevel)
  );
}

function suspendingCalls(update, file, view, klass) {
  return update.value.filter((item) => {
    if (item.k !== 'call') {
      return false;
    }
    const { kind, name } = item.receiver;
    if (kind === 'none' || kind === 'this') {
      return suspendsWithoutReceiver(item.name, file, view, klass);
    }
    if (kind === 'async') {
      return (
        item.name === 'await' && importsKotlinx(file, 'async') && view.named('async').length === 0
      );
    }
    const type = kind === 'name' ? declaredType(name, update, file, view, klass) : undefined;
    return type !== undefined && suspendsThroughType(item.name, bareType(type), file, view);
  });
}

function memberVariable(update, file, view, klass) {
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

function isMember(update, file, view, klass) {
  return memberVariable(update, file, view, klass) !== undefined;
}

function isSharedVariable(update, file, view, klass) {
  if (update.locals.includes(update.target) && !update.viaThis) {
    return false;
  }
  const member = memberVariable(update, file, view, klass);
  if (member !== undefined) {
    return member;
  }
  return !update.viaThis && (file.topLevelVars ?? []).includes(update.target);
}

function readsTargetBefore(update, calls) {
  const first = update.value.indexOf(calls[0]);
  return update.value
    .slice(0, first)
    .some((item) => item.k === 'read' && item.name === update.target);
}

function staleUpdate(update, calls) {
  if (update.operator !== '=') {
    return true;
  }
  return !update.branching && readsTargetBefore(update, calls);
}

export function suspendedUpdateFindings(files, { finding, declaredIn }) {
  const view = new View(declaredIn);
  return files.flatMap((file) =>
    (file.updates ?? []).flatMap((update) => {
      const { klass, method, locked } = enclosing(update);
      if (locked || !isSharedVariable(update, file, view, klass)) {
        return [];
      }
      const calls = suspendingCalls(update, file, view, klass);
      if (calls.length === 0 || !staleUpdate(update, calls)) {
        return [];
      }
      const member = isMember(update, file, view, klass);
      const owner = member ? `${klass.qualified}.` : '';
      return [
        finding({
          rule: SUSPENDED_UPDATE_RULE,
          file: file.file,
          line: update.line,
          symbol: `${owner}${update.target} in ${method ?? '<init>'}`,
          message: message(calls[0].name, update.target),
        }),
      ];
    }),
  );
}
