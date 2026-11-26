import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, stringValue } from '../analysis/constant-resolution.mts';
import { wordsOf as untypedWordsOf } from '../../../../../../shared/naming/secret-words.mts';
import { ormSite } from '../support/orm/sites.mts';
import { callChain, rootNode } from '../support/orm/chains.mts';
import { nameOf } from '../typed/node-views.mts';
import { callsReadOnlyFunction } from './project-reads/read-only-functions.mts';

export type FileContext = {
  readonly sourceCode: TSESLint.SourceCode;
  readonly filename: string;
};

export type ReadStatement = {
  readonly statement: TSESTree.VariableDeclaration;
  readonly call: TSESTree.CallExpression;
  readonly id: TSESTree.BindingName;
};

const GUARD_WORDS = new Set([
  'auth',
  'authorization',
  'authorize',
  'permission',
  'permissions',
  'session',
  'membership',
  'memberships',
  'role',
  'roles',
  'access',
  'owner',
  'ownership',
  'allowed',
  'policy',
  'credential',
  'credentials',
  'token',
  'verify',
  'guard',
  'acl',
]);
const wordsOf: (name: string) => string[] = untypedWordsOf;
const READ_METHODS = new Set(['GET', 'HEAD']);
const TRANSACTION_CLIENT =
  /^(?:tx|trx|txn|t|manager|em|runner|queryRunner|entityManager)$|transaction/iu;
const LOCKING_STEPS = new Set([
  'for',
  'forUpdate',
  'forShare',
  'forNoKeyUpdate',
  'lock',
  'setLock',
]);

function plainProperties(
  options: TSESTree.ObjectExpression,
): Map<string, TSESTree.Property> | undefined {
  const found = new Map<string, TSESTree.Property>();
  for (const property of options.properties) {
    const name = property.type === AST_NODE_TYPES.Property ? nameOf(property.key) : undefined;
    if (property.type !== AST_NODE_TYPES.Property || property.computed || name === undefined) {
      return undefined;
    }
    found.set(name, property);
  }
  return found;
}

function isReadFetch(call: TSESTree.CallExpression): boolean {
  if (call.callee.type !== AST_NODE_TYPES.Identifier || call.callee.name !== 'fetch') {
    return false;
  }
  const [url, options, ...rest] = call.arguments;
  if (url === undefined || rest.length > 0) {
    return false;
  }
  if (options === undefined) {
    return true;
  }
  if (options.type !== AST_NODE_TYPES.ObjectExpression) {
    return false;
  }
  const properties = plainProperties(options);
  const method = properties?.get('method');
  if (properties === undefined || properties.has('body')) {
    return false;
  }
  const verb = method === undefined ? 'GET' : stringValue(method.value)?.toUpperCase();
  return verb !== undefined && READ_METHODS.has(verb);
}

function isReadCall(call: TSESTree.CallExpression, orms: readonly string[]): boolean {
  return isReadFetch(call) || ormSite(call, 'read', orms) !== undefined;
}

function isReadOrReadOnlyCall(
  call: TSESTree.CallExpression,
  orms: readonly string[],
  context: FileContext,
): boolean {
  return (
    isReadCall(call, orms) ||
    callsReadOnlyFunction(call, context, (inner) => isReadCall(inner, orms))
  );
}

export function readStatement(
  statement: TSESTree.Statement,
  orms: readonly string[],
  context: FileContext,
): ReadStatement | undefined {
  if (statement.type !== AST_NODE_TYPES.VariableDeclaration || statement.kind !== 'const') {
    return undefined;
  }
  const [declarator, ...others] = statement.declarations;
  const awaited = declarator?.init;
  if (
    declarator === undefined ||
    others.length > 0 ||
    awaited?.type !== AST_NODE_TYPES.AwaitExpression ||
    awaited.argument.type !== AST_NODE_TYPES.CallExpression ||
    !isReadOrReadOnlyCall(awaited.argument, orms, context)
  ) {
    return undefined;
  }
  return { statement, call: awaited.argument, id: declarator.id };
}

function clientNames(call: TSESTree.CallExpression, sourceCode: TSESLint.SourceCode): string[] {
  const root = rootNode(call);
  if (root?.type !== AST_NODE_TYPES.Identifier) {
    return [];
  }
  const definition = findVariable({ sourceCode }, root, root.name)?.defs[0];
  const init =
    definition?.node.type === AST_NODE_TYPES.VariableDeclarator ? definition.node.init : undefined;
  const source = init ? rootNode(init) : undefined;
  return [root.name, ...(source?.type === AST_NODE_TYPES.Identifier ? [source.name] : [])];
}

export function runsInTransaction(read: ReadStatement, sourceCode: TSESLint.SourceCode): boolean {
  const steps = callChain(read.call).steps.map((step) => step.name ?? '');
  return (
    steps.some((name) => LOCKING_STEPS.has(name)) ||
    clientNames(read.call, sourceCode).some((name) => TRANSACTION_CLIENT.test(name))
  );
}

export function looksLikeGuard(read: ReadStatement, sourceCode: TSESLint.SourceCode): boolean {
  const names = callChain(read.call).steps.map((step) => step.name ?? '');
  const declared = sourceCode.getText(read.id);
  return [...names, declared].some((name) => wordsOf(name).some((word) => GUARD_WORDS.has(word)));
}

export function readsEarlier(
  later: ReadStatement,
  earlier: readonly ReadStatement[],
  sourceCode: TSESLint.SourceCode,
): boolean {
  const [start, end] = later.call.range;
  return earlier.some((read) =>
    sourceCode
      .getDeclaredVariables(read.statement)
      .some((variable) =>
        variable.references.some(
          (reference) =>
            reference.identifier.range[0] >= start && reference.identifier.range[1] <= end,
        ),
      ),
  );
}
