import type { KotlinFile, ClassFact } from '../typed/kotlin-fact-types.mts';
import type { ImportResolver } from '../typed/kotlin-flow-types.mts';

const COROUTINES = 'kotlinx.coroutines';
const SYNC = `${COROUTINES}.sync`;
const CHANNELS = `${COROUTINES}.channels`;
const FLOW = `${COROUTINES}.flow`;
const COLLECT = 'collect';
const SCOPE_NAME = 'CoroutineScope';

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
type TypeEntry = { fq: string; members: Set<string> };

const TYPE_ROWS: [string, string, string[]][] = [
  ['Job', COROUTINES, ['join']],
  ['Deferred', COROUTINES, ['await', 'join']],
  ['CompletableDeferred', COROUTINES, ['await', 'join']],
  ['Mutex', SYNC, ['lock']],
  ['Semaphore', SYNC, ['acquire']],
  ['Channel', CHANNELS, ['send', 'receive', 'receiveCatching']],
  ['SendChannel', CHANNELS, ['send']],
  ['ReceiveChannel', CHANNELS, ['receive', 'receiveCatching']],
  ['MutableSharedFlow', FLOW, ['emit', COLLECT]],
  ['FlowCollector', FLOW, ['emit']],
  ['Flow', FLOW, [COLLECT]],
  ['SharedFlow', FLOW, [COLLECT]],
  ['StateFlow', FLOW, [COLLECT]],
  ['MutableStateFlow', FLOW, ['emit', COLLECT]],
];
const TYPES = new Map<string, TypeEntry>(
  TYPE_ROWS.map(([name, pack, members]) => [
    name,
    { fq: `${pack}.${name}`, members: new Set(members) },
  ]),
);
const BUILDERS = new Map<string, [string, string]>([
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
const SCOPE_BUILDERS = new Map<string, string>([
  ['call:CoroutineScope', SCOPE_TYPE],
  ['call:MainScope', `${COROUTINES}.MainScope`],
]);

function lastSegment(path: string): string {
  return path.slice(path.lastIndexOf('.') + 1);
}

function packageOf(qualified: string): string {
  return qualified.slice(0, qualified.lastIndexOf('.'));
}

export function importResolver(file: KotlinFile): ImportResolver {
  const declared = new Set([
    ...file.functions.map(({ name }) => name),
    ...file.classes.map(({ name }) => name),
    ...file.properties.map(({ name }) => name),
  ]);
  const explicit = file.imports.filter(({ all }) => !all);
  const stars = new Set(file.imports.filter(({ all }) => all).map(({ path }) => path));
  function resolves(local: string, qualified: string): boolean {
    const named = explicit.find(({ alias, path }) => (alias ?? lastSegment(path)) === local);
    if (named !== undefined) {
      return named.path === qualified;
    }
    return !declared.has(local) && stars.has(packageOf(qualified));
  }
  resolves.realName = (local: string): string => {
    const named = explicit.find(({ alias }) => alias === local);
    return named === undefined ? local : lastSegment(named.path);
  };
  return resolves;
}

export function coroutineFunction(
  resolves: ImportResolver,
  { name, qualifier }: { name: string; qualifier?: string | undefined },
): string | undefined {
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

export function isCoroutineExtension(resolves: ImportResolver, name: string): boolean {
  const real = resolves.realName(name);
  const qualified = EXTENSIONS.get(real);
  return qualified !== undefined && resolves(name, qualified);
}

export function coroutineType(
  resolves: ImportResolver,
  written: string | undefined,
): string | undefined {
  if (written === undefined) {
    return undefined;
  }
  const builder = BUILDERS.get(written);
  if (builder !== undefined) {
    return resolves(written.slice(CALL_PREFIX.length), builder[1]) ? builder[0] : undefined;
  }
  const byQualified = [...TYPES.keys()].find((name) => TYPES.get(name)?.fq === written);
  if (byQualified !== undefined) {
    return byQualified;
  }
  const entry = TYPES.get(written);
  return entry !== undefined && resolves(written, entry.fq) ? written : undefined;
}

export function hasMember(type: string, member: string): boolean {
  return TYPES.get(type)?.members.has(member) === true;
}

function extendsScope(resolves: ImportResolver, klass: ClassFact): boolean {
  return klass.supers.some(
    (entry) => entry === SCOPE_TYPE || (entry === SCOPE_NAME && resolves(entry, SCOPE_TYPE)),
  );
}

export function isScope(
  resolves: ImportResolver,
  file: KotlinFile,
  written: string | undefined,
): boolean {
  if (written === undefined) {
    return false;
  }
  const scopeBuilder = SCOPE_BUILDERS.get(written);
  if (scopeBuilder !== undefined) {
    return resolves(written.slice(CALL_PREFIX.length), scopeBuilder);
  }
  if (written === SCOPE_TYPE || (written === SCOPE_NAME && resolves(written, SCOPE_TYPE))) {
    return true;
  }
  return file.classes.some(
    (klass) =>
      (klass.name === written || klass.qualified === written) && extendsScope(resolves, klass),
  );
}

export function isGlobalScopeAlias(resolves: ImportResolver, name: string): boolean {
  return (
    name !== 'GlobalScope' &&
    resolves.realName(name) === 'GlobalScope' &&
    resolves(name, `${COROUTINES}.GlobalScope`)
  );
}

export function isScopeClass(
  resolves: ImportResolver,
  file: KotlinFile,
  owner: string | undefined,
): boolean {
  return file.classes.some((klass) => klass.qualified === owner && extendsScope(resolves, klass));
}

export function isScopeExtension(resolves: ImportResolver): boolean {
  return resolves(SCOPE_NAME, SCOPE_TYPE);
}

export function launchBuilder(resolves: ImportResolver, name: string): string | undefined {
  const real = resolves.realName(name);
  return LAUNCH_BUILDERS.has(real) && resolves(name, `${COROUTINES}.${real}`) ? real : undefined;
}
