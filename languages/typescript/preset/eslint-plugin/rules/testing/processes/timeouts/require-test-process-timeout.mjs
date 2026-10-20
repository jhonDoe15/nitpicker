import { variableNamed } from '../../../analysis/ancestry.mjs';
import { importedCalleeName, moduleBindings } from '../../../analysis/subprocess-calls.mjs';
import { memberName } from '../../../analysis/test-code-analysis.mjs';
import { lacksProcessTimeout } from './process-timeout-options.mjs';

const CHILD_PROCESS = new Set(['child_process', 'node:child_process']);
const SYNC_METHODS = new Set(['spawnSync', 'execSync', 'execFileSync']);

function shadowedRequire(context, variable) {
  const initializer = variable.defs[0]?.node.init;
  const callee = initializer?.type === 'CallExpression' ? initializer.callee : undefined;
  return (
    callee?.type === 'Identifier' &&
    callee.name === 'require' &&
    (variableNamed(context.sourceCode, callee)?.defs.length ?? 0) > 0
  );
}

function methodOf(context, callee, bindings) {
  const identifier = callee.type === 'MemberExpression' ? callee.object : callee;
  if (identifier.type !== 'Identifier') {
    return undefined;
  }
  const variable = variableNamed(context.sourceCode, identifier);
  if (variable?.scope.block.type !== 'Program') {
    return undefined;
  }
  if (shadowedRequire(context, variable)) {
    return undefined;
  }
  if (variable.references.some((reference) => reference.isWrite() && !reference.init)) {
    return undefined;
  }
  return callee.type === 'MemberExpression' && bindings.namespaces.has(identifier.name)
    ? memberName(callee)
    : importedCalleeName(callee, bindings);
}

export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Require a timeout on synchronous test subprocesses' },
    schema: [],
    messages: {
      missingTimeout:
        'Give {{method}} a positive subprocess timeout, such as { timeout: 10_000 }. A test runner timeout cannot interrupt a synchronous child process, so a stuck command can hang the suite. If this process must wait without a deadline, add an exception for this rule in nitpicker.config.json.',
    },
  },
  create(context) {
    let bindings = { named: new Map(), namespaces: new Set() };
    return {
      Program(node) {
        bindings = moduleBindings(node, CHILD_PROCESS);
      },
      CallExpression(node) {
        const method = methodOf(context, node.callee, bindings);
        if (SYNC_METHODS.has(method) && lacksProcessTimeout(context, node, method)) {
          context.report({ node, messageId: 'missingTimeout', data: { method } });
        }
      },
    };
  },
};
