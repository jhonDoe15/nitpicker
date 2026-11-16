import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import path from 'node:path';
import { suggestible } from '../../../../fixes/support/descriptors.mts';
import { processTimeoutFix } from '../../../../fixes/processes/process-timeout-fix.mts';
import {
  importedCalleeName,
  moduleBindings,
  type ModuleBindings,
} from '../../../analysis/subprocess-calls.mts';
import { memberName } from '../../../analysis/test-code-analysis.mts';
import { variableNamed } from '../../../typed/node-views.mts';
import {
  lacksProcessTimeout,
  optionsArgument,
} from '../../../processes/process-timeout-options.mts';
import { timeoutLimits, timeoutPolicy } from './timeout-policy.mts';

type MessageId = 'missingTimeout' | 'addTimeout';
type Context = Readonly<TSESLint.RuleContext<MessageId, []>>;

const { DefinitionType } = TSESLint.Scope;

const CHILD_PROCESS = new Set(['child_process', 'node:child_process']);
const SYNC_METHODS = new Set(['spawnSync', 'execSync', 'execFileSync']);

function shadowedRequire(context: Context, variable: TSESLint.Scope.Variable): boolean {
  const definition = variable.defs[0];
  const initializer =
    definition?.type === DefinitionType.Variable ? definition.node.init : undefined;
  const callee =
    initializer?.type === AST_NODE_TYPES.CallExpression ? initializer.callee : undefined;
  return (
    callee?.type === AST_NODE_TYPES.Identifier &&
    callee.name === 'require' &&
    (variableNamed(context.sourceCode, callee)?.defs.length ?? 0) > 0
  );
}

function methodOf(
  context: Context,
  callee: TSESTree.Node,
  bindings: ModuleBindings,
): string | undefined {
  const identifier = callee.type === AST_NODE_TYPES.MemberExpression ? callee.object : callee;
  if (identifier.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  const variable = variableNamed(context.sourceCode, identifier);
  if (variable?.scope.block.type !== AST_NODE_TYPES.Program) {
    return undefined;
  }
  if (shadowedRequire(context, variable)) {
    return undefined;
  }
  if (variable.references.some((reference) => reference.isWrite() && !reference.init)) {
    return undefined;
  }
  return callee.type === AST_NODE_TYPES.MemberExpression && bindings.namespaces.has(identifier.name)
    ? memberName(callee)
    : importedCalleeName(callee, bindings);
}

function defaultTimeoutMs(context: Context): number {
  const file = path.relative(context.cwd, context.filename).replaceAll('\\', '/');
  return timeoutLimits(timeoutPolicy(context.settings), file, false).testDeclarationCeilingMs;
}

function reportMissing(context: Context, node: TSESTree.CallExpression, method: string): void {
  const timeout = defaultTimeoutMs(context);
  const optionsNode = optionsArgument(context, node, method === 'execSync');
  const plan = processTimeoutFix(context.sourceCode, node, { method, timeout, optionsNode });
  context.report(
    suggestible(
      { node, messageId: 'missingTimeout', data: { method } },
      { messageId: 'addTimeout', plan, data: { ms: String(timeout) } },
    ),
  );
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    hasSuggestions: true,
    docs: { description: 'Require a timeout on synchronous test subprocesses' },
    schema: [],
    messages: {
      missingTimeout:
        'Give {{method}} a positive subprocess timeout, such as { timeout: 10_000 }. A test runner timeout cannot interrupt a synchronous child process, so a stuck command can hang the suite. An exception fits only when this process must wait without a deadline.',
      addTimeout: 'Add a timeout of {{ms}} ms.',
    },
  },
  create(context) {
    let bindings: ModuleBindings = { named: new Map(), namespaces: new Set() };
    return {
      Program(node) {
        bindings = moduleBindings(node, CHILD_PROCESS);
      },
      CallExpression(node) {
        const method = methodOf(context, node.callee, bindings);
        if (
          method !== undefined &&
          SYNC_METHODS.has(method) &&
          lacksProcessTimeout(context, node, method)
        ) {
          reportMissing(context, node, method);
        }
      },
    };
  },
};
