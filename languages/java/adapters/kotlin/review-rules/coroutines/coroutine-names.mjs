const COROUTINES = 'kotlinx.coroutines';
const SYNC = `${COROUTINES}.sync`;
const CHANNELS = `${COROUTINES}.channels`;
const FLOW = `${COROUTINES}.flow`;

const FUNCTIONS = new Map([
  ['delay', `${COROUTINES}.delay`],
  ['yield', `${COROUTINES}.yield`],
  ['withContext', `${COROUTINES}.withContext`],
  ['withTimeout', `${COROUTINES}.withTimeout`],
  ['withTimeoutOrNull', `${COROUTINES}.withTimeoutOrNull`],
  ['coroutineScope', `${COROUTINES}.coroutineScope`],
  ['supervisorScope', `${COROUTINES}.supervisorScope`],
  ['awaitCancellation', `${COROUTINES}.awaitCancellation`],
  ['suspendCancellableCoroutine', `${COROUTINES}.suspendCancellableCoroutine`],
  ['suspendCoroutine', 'kotlin.coroutines.suspendCoroutine'],
]);
const EXTENSIONS = new Map([
  ['awaitAll', `${COROUTINES}.awaitAll`],
  ['joinAll', `${COROUTINES}.joinAll`],
  ['cancelAndJoin', `${COROUTINES}.cancelAndJoin`],
  ['withLock', `${SYNC}.withLock`],
  ['withPermit', `${SYNC}.withPermit`],
]);
const TYPES = new Map(
  [
    ['Job', COROUTINES, ['join']],
    ['Deferred', COROUTINES, ['await', 'join']],
    ['CompletableDeferred', COROUTINES, ['await', 'join']],
    ['Mutex', SYNC, ['lock']],
    ['Semaphore', SYNC, ['acquire']],
    ['Channel', CHANNELS, ['send', 'receive', 'receiveCatching']],
    ['SendChannel', CHANNELS, ['send']],
    ['ReceiveChannel', CHANNELS, ['receive', 'receiveCatching']],
    ['MutableSharedFlow', FLOW, ['emit', 'collect']],
    ['FlowCollector', FLOW, ['emit']],
    ['Flow', FLOW, ['collect']],
    ['SharedFlow', FLOW, ['collect']],
    ['StateFlow', FLOW, ['collect']],
    ['MutableStateFlow', FLOW, ['emit', 'collect']],
  ].map(([name, pack, members]) => [name, { fq: `${pack}.${name}`, members: new Set(members) }]),
);
const BUILDERS = new Map([
  ['call:launch', ['Job', `${COROUTINES}.launch`]],
  ['call:async', ['Deferred', `${COROUTINES}.async`]],
  ['call:CompletableDeferred', ['CompletableDeferred', `${COROUTINES}.CompletableDeferred`]],
  ['call:Mutex', ['Mutex', `${SYNC}.Mutex`]],
  ['call:Semaphore', ['Semaphore', `${SYNC}.Semaphore`]],
  ['call:Channel', ['Channel', `${CHANNELS}.Channel`]],
  ['call:MutableSharedFlow', ['MutableSharedFlow', `${FLOW}.MutableSharedFlow`]],
  ['call:MutableStateFlow', ['MutableStateFlow', `${FLOW}.MutableStateFlow`]],
]);
const LAUNCH_BUILDERS = new Set(['launch', 'async']);
const SCOPE_TYPE = `${COROUTINES}.CoroutineScope`;
const CALL_PREFIX = 'call:';
const SCOPE_BUILDERS = new Map([
  ['call:CoroutineScope', SCOPE_TYPE],
  ['call:MainScope', `${COROUTINES}.MainScope`],
]);

function lastSegment(path) {
  return path.slice(path.lastIndexOf('.') + 1);
}

function packageOf(qualified) {
  return qualified.slice(0, qualified.lastIndexOf('.'));
}

export function importResolver(file) {
  const declared = new Set([
    ...file.functions.map(({ name }) => name),
    ...file.classes.map(({ name }) => name),
    ...file.properties.map(({ name }) => name),
  ]);
  const explicit = file.imports.filter(({ all }) => !all);
  const stars = new Set(file.imports.filter(({ all }) => all).map(({ path }) => path));
  function resolves(local, qualified) {
    const named = explicit.find(({ alias, path }) => (alias ?? lastSegment(path)) === local);
    if (named !== undefined) {
      return named.path === qualified;
    }
    return !declared.has(local) && stars.has(packageOf(qualified));
  }
  resolves.realName = (local) => {
    const named = explicit.find(({ alias }) => alias === local);
    return named === undefined ? local : lastSegment(named.path);
  };
  return resolves;
}

export function coroutineFunction(resolves, { name, qualifier }) {
  const real = qualifier === undefined ? resolves.realName(name) : name;
  const qualified = FUNCTIONS.get(real) ?? EXTENSIONS.get(real);
  if (qualified === undefined) {
    return undefined;
  }
  const present =
    qualifier === undefined
      ? resolves(name, qualified)
      : qualifier === packageOf(qualified) && FUNCTIONS.has(real);
  return present ? real : undefined;
}

export function isCoroutineExtension(resolves, name) {
  const real = resolves.realName(name);
  return EXTENSIONS.has(real) && resolves(name, EXTENSIONS.get(real));
}

export function coroutineType(resolves, written) {
  if (written === undefined) {
    return undefined;
  }
  const builder = BUILDERS.get(written);
  if (builder !== undefined) {
    return resolves(written.slice(CALL_PREFIX.length), builder[1]) ? builder[0] : undefined;
  }
  const byQualified = [...TYPES.keys()].find((name) => TYPES.get(name).fq === written);
  if (byQualified !== undefined) {
    return byQualified;
  }
  const entry = TYPES.get(written);
  return entry !== undefined && resolves(written, entry.fq) ? written : undefined;
}

export function hasMember(type, member) {
  return TYPES.get(type)?.members.has(member) === true;
}

function extendsScope(resolves, klass) {
  return klass.supers.some(
    (entry) => entry === SCOPE_TYPE || (entry === 'CoroutineScope' && resolves(entry, SCOPE_TYPE)),
  );
}

export function isScope(resolves, file, written) {
  if (written === undefined) {
    return false;
  }
  if (SCOPE_BUILDERS.has(written)) {
    return resolves(written.slice(CALL_PREFIX.length), SCOPE_BUILDERS.get(written));
  }
  if (written === SCOPE_TYPE || (written === 'CoroutineScope' && resolves(written, SCOPE_TYPE))) {
    return true;
  }
  return file.classes.some(
    (klass) =>
      (klass.name === written || klass.qualified === written) && extendsScope(resolves, klass),
  );
}

export function isGlobalScopeAlias(resolves, name) {
  return (
    name !== 'GlobalScope' &&
    resolves.realName(name) === 'GlobalScope' &&
    resolves(name, `${COROUTINES}.GlobalScope`)
  );
}

export function isScopeClass(resolves, file, owner) {
  return file.classes.some((klass) => klass.qualified === owner && extendsScope(resolves, klass));
}

export function isScopeExtension(resolves) {
  return resolves('CoroutineScope', SCOPE_TYPE);
}

export function launchBuilder(resolves, name) {
  const real = resolves.realName(name);
  return LAUNCH_BUILDERS.has(real) && resolves(name, `${COROUTINES}.${real}`) ? real : undefined;
}
