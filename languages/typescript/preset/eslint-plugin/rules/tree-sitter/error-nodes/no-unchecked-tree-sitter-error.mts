import { AST_NODE_TYPES, type TSESLint } from '@typescript-eslint/utils';
import { ancestorsOf } from '../../typed/node-views.mts';
import { isCallback, isFunction, type FunctionNode } from '../../typed/syntax-views.mts';
import { hasErrorCheck } from './error-checks.mts';
import { calledHelperHasErrorCheck, localFunctionsFor } from './local-helpers.mts';
import { importsTreeSitter } from './tree-sitter-imports.mts';
import { firstUncheckedAccess } from './unchecked-access.mts';

type MessageId = 'uncheckedErrorNode';

type RuleState = {
  readonly reported: WeakSet<FunctionNode>;
  readonly guarded: WeakMap<FunctionNode, boolean>;
};

function isFunctionGuarded(fn: FunctionNode, guarded: WeakMap<FunctionNode, boolean>): boolean {
  const cached = guarded.get(fn);
  if (cached !== undefined) {
    return cached;
  }
  const result = hasErrorCheck(fn) || calledHelperHasErrorCheck(fn, localFunctionsFor(fn));
  guarded.set(fn, result);
  return result;
}

function hasEnclosingGuard(fn: FunctionNode, guarded: WeakMap<FunctionNode, boolean>): boolean {
  for (const ancestor of ancestorsOf(fn)) {
    if (ancestor.type === AST_NODE_TYPES.IfStatement && hasErrorCheck(ancestor.test)) {
      return true;
    }
    if (isFunction(ancestor) && isFunctionGuarded(ancestor, guarded)) {
      return true;
    }
  }
  return false;
}

function isReportedEnclosingCallback(fn: FunctionNode, reported: WeakSet<FunctionNode>): boolean {
  if (!isCallback(fn)) {
    return false;
  }
  return ancestorsOf(fn).some((ancestor) => isFunction(ancestor) && reported.has(ancestor));
}

function checkFunction(
  context: TSESLint.RuleContext<MessageId, []>,
  fn: FunctionNode,
  state: RuleState,
): void {
  if (
    isReportedEnclosingCallback(fn, state.reported) ||
    hasEnclosingGuard(fn, state.guarded) ||
    isFunctionGuarded(fn, state.guarded)
  ) {
    return;
  }
  const access = firstUncheckedAccess(fn);
  if (access === undefined) {
    return;
  }
  state.reported.add(fn);
  context.report({ node: access, messageId: 'uncheckedErrorNode' });
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require tree-sitter error node checks before walking children or chaining childForFieldName',
    },
    schema: [],
    messages: {
      uncheckedErrorNode:
        'Tree-sitter error nodes can stand in for any child when a file has syntax errors. ' +
        "Check `hasError`, `isError`, `isMissing`, or `type === 'ERROR'` and decide whether to " +
        'skip the unit or handle the error node.',
    },
  },
  create(context) {
    if (!importsTreeSitter(context.sourceCode.ast)) {
      return {};
    }
    const state: RuleState = {
      reported: new WeakSet(),
      guarded: new WeakMap(),
    };
    const visit = (node: FunctionNode): void => {
      checkFunction(context, node, state);
    };
    return {
      FunctionDeclaration: visit,
      FunctionExpression: visit,
      ArrowFunctionExpression: visit,
    };
  },
};
