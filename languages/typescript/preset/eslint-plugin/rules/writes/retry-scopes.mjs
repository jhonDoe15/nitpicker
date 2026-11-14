import { constantInitializer } from '../analysis/ancestry.mjs';
import { importedBindings } from '../security/imported-names.mjs';
import { typeServices } from '../security/security-values.mjs';
import { estreeCallView } from '../support/io/call-views.mjs';
import { packageFromPath } from '../support/io/packages.mjs';

const DEFAULT = 'default';
const RETRY_FUNCTIONS = new Map([
  ['p-retry', DEFAULT],
  ['async-retry', DEFAULT],
  ['exponential-backoff', 'backOff'],
]);
const POLICY_MODULE = 'cockatiel';
const POLICY_TYPES = new Set(['RetryPolicy', 'IPolicy', 'IMergedPolicy']);

function isRetryFunction(binding) {
  return binding !== undefined && RETRY_FUNCTIONS.get(binding.module) === binding.name;
}

function policyCall(sourceCode, node) {
  const value = node.type === 'Identifier' ? constantInitializer(sourceCode, node) : node;
  return value?.type === 'CallExpression' ? value : undefined;
}

function isPolicyType(context, node) {
  const services = typeServices(context);
  if (services === undefined) {
    return false;
  }
  const type = services.getTypeAtLocation(node);
  const symbol = type.aliasSymbol ?? type.getSymbol();
  const file = symbol?.declarations?.[0]?.getSourceFile().fileName;
  return (
    file !== undefined && packageFromPath(file) === POLICY_MODULE && POLICY_TYPES.has(symbol.name)
  );
}

function isPolicyExecute(context, callee, bindings) {
  if (callee.type !== 'MemberExpression' || callee.property.name !== 'execute') {
    return false;
  }
  const policy = policyCall(context.sourceCode, callee.object);
  const root = policy === undefined ? undefined : estreeCallView(policy).root;
  const built = root !== undefined && bindings.get(root.name)?.module === POLICY_MODULE;
  return built || isPolicyType(context, callee.object);
}

export function retryScope(call, context) {
  const bindings = importedBindings(context.sourceCode.ast);
  const { callee } = call;
  const retries =
    (callee.type === 'Identifier' && isRetryFunction(bindings.get(callee.name))) ||
    isPolicyExecute(context, callee, bindings);
  return retries
    ? { label: `\`${estreeCallView(call).label}\``, retried: call.arguments[0] }
    : undefined;
}
