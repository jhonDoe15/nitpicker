import type { ClassFact, KotlinFile } from '../../typed/kotlin-fact-types.mts';
import type { ClassScope, ItemScope, LockedItem } from './locking-types.mts';
import type { ClassIndex, LockSite } from './locking-sites.mts';

const LOCK_SOURCES: Record<string, 'argument' | 'qualifier'> = {
  synchronized: 'argument',
  withLock: 'qualifier',
};
const DEFAULT_HOSTS: Record<string, string> = {
  synchronized: 'synchronized',
  withLock: 'withLock',
};
const CLASS = 'class';
const THIS_PREFIX = /^this\./u;
const QUALIFIED = /^([A-Z][\w$]*)\.([\w$]+)$/u;
const NAME = /^[\p{L}_$][\p{L}\p{N}_$]*$/u;

function isClassScope(scope: ItemScope | undefined): scope is ClassScope {
  return scope?.k === CLASS && scope.qualified !== undefined;
}

export function enclosingClass(item: { scopes: ItemScope[] }): ClassScope | undefined {
  const owner = item.scopes.find(({ k }) => k === CLASS || k === 'object');
  return isClassScope(owner) ? owner : undefined;
}

export function unitOf(item: { scopes: ItemScope[] }): ItemScope | undefined {
  return item.scopes.find(({ k }) => k === 'fun' || k === 'init' || k === CLASS || k === 'object');
}

function memberNames(klass: { qualified: string }, { file, view }: LockSite): Set<string> {
  const own = [klass.qualified, `${klass.qualified}.Companion`];
  const declared = file.properties
    .filter(({ owner }) => own.includes(owner))
    .map(({ name }) => name);
  const parameters = (view.get(klass.qualified)?.primaryParameters ?? [])
    .filter(({ property }) => typeof property === 'string')
    .map(({ name }) => name);
  return new Set([...declared, ...parameters]);
}

export function lockKey(
  text: string,
  { klass, locals, site }: { klass: ClassScope; locals: string[]; site: LockSite },
): string | undefined {
  if (text === 'this') {
    return 'this';
  }
  const names = memberNames(klass, site);
  const plain = text.replace(THIS_PREFIX, '');
  if (plain !== text) {
    return names.has(plain) ? plain : undefined;
  }
  if (NAME.test(text)) {
    return names.has(text) && !locals.includes(text) ? text : undefined;
  }
  const qualified = QUALIFIED.exec(text);
  if (qualified === null) {
    return undefined;
  }
  const member = qualified[2];
  return qualified[1] === klass.name && member !== undefined && names.has(member) ? member : text;
}

export function heldLocks(
  item: LockedItem,
  { klass, site }: { klass: ClassScope; site: LockSite },
): { held: string[]; opaque: boolean } {
  const held: string[] = [];
  const hosts = site.file.lockHosts ?? DEFAULT_HOSTS;
  for (const scope of item.scopes) {
    const host = scope.host === undefined ? undefined : hosts[scope.host];
    const source =
      scope.host !== undefined && Object.hasOwn(hosts, scope.host) && host !== undefined
        ? LOCK_SOURCES[host]
        : undefined;
    if (scope.k === 'lambda' && source === undefined) {
      return { held, opaque: true };
    }
    if (scope.k === 'lambda' && source !== undefined) {
      held.push(lockKey(scope[source] ?? '', { klass, locals: item.locals, site }) ?? '?');
    } else if (scope.k !== 'loop' && scope.k !== 'foreach') {
      break;
    }
  }
  if (item.synchronizedFunction) {
    held.push('this');
  }
  return { held, opaque: false };
}

export function classView(files: KotlinFile[]): ClassIndex {
  return new Map(
    files.flatMap((file) =>
      file.classes.map((klass): [string, ClassFact] => [klass.qualified, klass]),
    ),
  );
}
