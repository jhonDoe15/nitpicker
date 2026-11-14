import { findVariable } from '../../analysis/constant-resolution.mjs';
import { wordsOf } from '../../../../../../../shared/naming/secret-words.mjs';
import { calleeOrigin } from '../io-effects.mjs';
import { isDatabasePackage } from '../io/packages.mjs';

const LOCK_OWNERS = new Set(['lock', 'locks', 'mutex', 'redlock']);
const LOCK_PACKAGES = new Set(['async-lock', 'redlock']);
const SEMAPHORE = 'Semaphore';
const SEMAPHORE_WORD = 'semaphore';

function singlePermit(call, context) {
  const receiver = call.callee.type === 'MemberExpression' ? call.callee.object : undefined;
  if (receiver?.type !== 'Identifier') {
    return false;
  }
  const init = findVariable(context, receiver, receiver.name)?.defs[0]?.node.init;
  const [permits] = init?.type === 'NewExpression' ? init.arguments : [];
  return permits?.type === 'Literal' && permits.value === 1;
}

function namedLock(site, context) {
  const owners = site.view.names.slice(0, -1).map((name) => wordsOf(name).at(-1));
  if (owners.includes(SEMAPHORE_WORD)) {
    return singlePermit(site.call, context);
  }
  return site.view.method === 'runExclusive' || owners.some((name) => LOCK_OWNERS.has(name));
}

function typedLock(origin, site, context) {
  if (origin.pkg === undefined) {
    return namedLock(site, context);
  }
  if (origin.pkg === 'async-mutex') {
    return origin.owner?.startsWith(SEMAPHORE) !== true || singlePermit(site.call, context);
  }
  if (origin.pkg === 'lib') {
    return origin.owner === 'LockManager';
  }
  return LOCK_PACKAGES.has(origin.pkg);
}

function typedTransaction(origin, role) {
  return isDatabasePackage(origin.pkg ?? '') || (role === 'callbacks' && origin.pkg === undefined);
}

export function isOwned(kind, site, context) {
  const origin = calleeOrigin(site.call, context);
  if (kind === 'transaction') {
    return origin === undefined || typedTransaction(origin, site.role);
  }
  return origin === undefined ? namedLock(site, context) : typedLock(origin, site, context);
}
