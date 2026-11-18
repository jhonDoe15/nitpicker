import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { importedBindings, type ImportedBinding } from '../security/imported-names.mts';
import { typeServices, type Context } from '../security/security-values.mts';
import { estreeCallView } from '../support/io/call-views.mts';
import { packageFromPath } from '../support/io/packages.mts';
import { constantInitializer, nameOf, type SourceCode } from '../typed/node-views.mts';

export type RetryScope = {
  readonly label: string;
  readonly retried: TSESTree.CallExpressionArgument | undefined;
};

const DEFAULT = 'default';
const RETRY_FUNCTIONS = new Map<string, string>([
  ['p-retry', DEFAULT],
  ['async-retry', DEFAULT],
  ['exponential-backoff', 'backOff'],
]);
const POLICY_MODULE = 'cockatiel';
const POLICY_TYPES = new Set<string>(['RetryPolicy', 'IPolicy', 'IMergedPolicy']);

function isRetryFunction(binding: ImportedBinding | undefined): boolean {
  return binding !== undefined && RETRY_FUNCTIONS.get(binding.module) === binding.name;
}

function policyCall(
  sourceCode: SourceCode,
  node: TSESTree.Node,
): TSESTree.CallExpression | undefined {
  const value =
    node.type === AST_NODE_TYPES.Identifier ? constantInitializer(sourceCode, node) : node;
  return value?.type === AST_NODE_TYPES.CallExpression ? value : undefined;
}

function isPolicyType(context: Context, node: TSESTree.Node): boolean {
  const services = typeServices(context);
  if (services === undefined) {
    return false;
  }
  const type = services.getTypeAtLocation(node);
  const symbol = type.aliasSymbol ?? type.getSymbol();
  const file = symbol?.declarations?.[0]?.getSourceFile().fileName;
  return (
    file !== undefined &&
    symbol !== undefined &&
    packageFromPath(file) === POLICY_MODULE &&
    POLICY_TYPES.has(symbol.name)
  );
}

function isPolicyExecute(
  context: Context,
  callee: TSESTree.Node,
  bindings: Map<string, ImportedBinding>,
): boolean {
  if (callee.type !== AST_NODE_TYPES.MemberExpression || nameOf(callee.property) !== 'execute') {
    return false;
  }
  const policy = policyCall(context.sourceCode, callee.object);
  const root = policy === undefined ? undefined : estreeCallView(policy, undefined).root;
  const built = root !== undefined && bindings.get(root.name)?.module === POLICY_MODULE;
  return built || isPolicyType(context, callee.object);
}

export function retryScope(
  call: TSESTree.CallExpression,
  context: Context,
): RetryScope | undefined {
  const bindings = importedBindings(context.sourceCode.ast);
  const { callee } = call;
  const retries =
    (callee.type === AST_NODE_TYPES.Identifier && isRetryFunction(bindings.get(callee.name))) ||
    isPolicyExecute(context, callee, bindings);
  return retries
    ? { label: `\`${estreeCallView(call, undefined).label}\``, retried: call.arguments[0] }
    : undefined;
}
