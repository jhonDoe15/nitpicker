import { constantInitializer } from '../analysis/ancestry.mjs';
import { estreeCallView } from '../support/io/call-views.mjs';

const DEFAULT = 'default';
const RETRY_FUNCTIONS = new Map([
  ['p-retry', DEFAULT],
  ['async-retry', DEFAULT],
  ['exponential-backoff', 'backOff'],
]);
const POLICY_MODULE = 'cockatiel';

function importedBindings(program) {
  return new Map(
    program.body
      .filter((statement) => statement.type === 'ImportDeclaration')
      .flatMap((statement) =>
        statement.specifiers.map((specifier) => [
          specifier.local.name,
          {
            module: statement.source.value,
            name: specifier.type === 'ImportSpecifier' ? specifier.imported.name : DEFAULT,
          },
        ]),
      ),
  );
}

function isRetryFunction(binding) {
  return binding !== undefined && RETRY_FUNCTIONS.get(binding.module) === binding.name;
}

function policyCall(sourceCode, node) {
  const value = node.type === 'Identifier' ? constantInitializer(sourceCode, node) : node;
  return value?.type === 'CallExpression' ? value : undefined;
}

function isPolicyExecute(sourceCode, callee, bindings) {
  if (callee.type !== 'MemberExpression' || callee.property.name !== 'execute') {
    return false;
  }
  const policy = policyCall(sourceCode, callee.object);
  const root = policy === undefined ? undefined : estreeCallView(policy).root;
  return root !== undefined && bindings.get(root.name)?.module === POLICY_MODULE;
}

export function retryScope(call, sourceCode) {
  const bindings = importedBindings(sourceCode.ast);
  const { callee } = call;
  const retries =
    (callee.type === 'Identifier' && isRetryFunction(bindings.get(callee.name))) ||
    isPolicyExecute(sourceCode, callee, bindings);
  return retries
    ? { label: `\`${estreeCallView(call).label}\``, retried: call.arguments[0] }
    : undefined;
}
