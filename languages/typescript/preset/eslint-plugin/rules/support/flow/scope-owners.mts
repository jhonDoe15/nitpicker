import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable } from '../../analysis/constant-resolution.mts';
import { wordsOf as untypedWordsOf } from '../../../../../../../shared/naming/secret-words.mjs';
import type { Context } from '../../security/security-values.mts';
import { calleeOrigin } from '../io-effects.mts';
import type { CallView } from '../io/call-views.mts';
import { isDatabasePackage } from '../io/packages.mts';
import type { CalleeOrigin } from '../io/typed-calls.mts';

export type OwnedSite = {
  readonly call: TSESTree.CallExpression;
  readonly view: CallView;
  readonly role?: string | undefined;
};

const wordsOf: (name: string) => string[] = untypedWordsOf;
const { DefinitionType } = TSESLint.Scope;

const LOCK_OWNERS = new Set(['lock', 'locks', 'mutex', 'redlock']);
const LOCK_PACKAGES = new Set(['async-lock', 'redlock']);
const SEMAPHORE = 'Semaphore';
const SEMAPHORE_WORD = 'semaphore';

function singlePermit(call: TSESTree.CallExpression, context: Context): boolean {
  const receiver =
    call.callee.type === AST_NODE_TYPES.MemberExpression ? call.callee.object : undefined;
  if (receiver?.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  const definition = findVariable(context, receiver, receiver.name)?.defs[0];
  const init = definition?.type === DefinitionType.Variable ? definition.node.init : undefined;
  const [permits] = init?.type === AST_NODE_TYPES.NewExpression ? init.arguments : [];
  return permits?.type === AST_NODE_TYPES.Literal && permits.value === 1;
}

function namedLock(site: OwnedSite, context: Context): boolean {
  const owners = site.view.names.slice(0, -1).map((name) => wordsOf(name).at(-1));
  if (owners.includes(SEMAPHORE_WORD)) {
    return singlePermit(site.call, context);
  }
  return (
    site.view.method === 'runExclusive' ||
    owners.some((name) => name !== undefined && LOCK_OWNERS.has(name))
  );
}

function typedLock(origin: CalleeOrigin, site: OwnedSite, context: Context): boolean {
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

function typedTransaction(origin: CalleeOrigin, role: string | undefined): boolean {
  return isDatabasePackage(origin.pkg ?? '') || (role === 'callbacks' && origin.pkg === undefined);
}

export function isOwned(kind: string, site: OwnedSite, context: Context): boolean {
  const origin = calleeOrigin(site.call, context);
  if (kind === 'transaction') {
    return origin === undefined || typedTransaction(origin, site.role);
  }
  return origin === undefined ? namedLock(site, context) : typedLock(origin, site, context);
}
