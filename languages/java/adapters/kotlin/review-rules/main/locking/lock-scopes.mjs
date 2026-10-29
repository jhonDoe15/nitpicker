const LOCK_SOURCES = { synchronized: 'argument', withLock: 'qualifier' };
const DEFAULT_HOSTS = { synchronized: 'synchronized', withLock: 'withLock' };
const THIS_PREFIX = /^this\./u;
const QUALIFIED = /^([A-Z][\w$]*)\.([\w$]+)$/u;
const NAME = /^[\p{L}_$][\p{L}\p{N}_$]*$/u;

export function enclosingClass(item) {
  const owner = item.scopes.find(({ k }) => k === 'class' || k === 'object');
  return owner?.k === 'class' ? owner : undefined;
}

export function unitOf(item) {
  return item.scopes.find(
    ({ k }) => k === 'fun' || k === 'init' || k === 'class' || k === 'object',
  );
}

function memberNames(klass, { file, view }) {
  const own = [klass.qualified, `${klass.qualified}.Companion`];
  const declared = file.properties
    .filter(({ owner }) => own.includes(owner))
    .map(({ name }) => name);
  const parameters = (view.get(klass.qualified)?.primaryParameters ?? [])
    .filter(({ property }) => property !== undefined && property !== null)
    .map(({ name }) => name);
  return new Set([...declared, ...parameters]);
}

export function lockKey(text, { klass, locals, site }) {
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
  return qualified[1] === klass.name && names.has(qualified[2]) ? qualified[2] : text;
}

export function heldLocks(item, { klass, site }) {
  const held = [];
  const hosts = site.file.lockHosts ?? DEFAULT_HOSTS;
  for (const scope of item.scopes) {
    const source = Object.hasOwn(hosts, scope.host ?? '')
      ? LOCK_SOURCES[hosts[scope.host]]
      : undefined;
    if (scope.k === 'lambda' && source !== undefined) {
      held.push(lockKey(scope[source] ?? '', { klass, locals: item.locals, site }) ?? '?');
    } else if (scope.k === 'lambda') {
      return { held, opaque: true };
    } else if (scope.k !== 'loop' && scope.k !== 'foreach') {
      break;
    }
  }
  if (item.synchronizedFunction) {
    held.push('this');
  }
  return { held, opaque: false };
}

export function classView(files) {
  return new Map(files.flatMap((file) => file.classes.map((klass) => [klass.qualified, klass])));
}
