import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { wrapperTop } from '../../analysis/globals/process-values.mts';
import { isTestFile } from '../../analysis/test-files/test-file-path.mts';
import { contains, variableNamed, type SourceCode } from '../../typed/node-views.mts';
import { innermostRepeat, invariantIn } from '../support/loop-invariance.mts';
import {
  copiedSourceOf,
  isMutatedInBoundary,
  isObjectAssignTarget,
  isSmallConstantValue,
  isSmallOrSkippedRepeat,
  rootIdentifierName,
  type CopyNode,
} from './copy-analysis.mts';

type MessageIds = 'loopInvariantCopy';
type Context = Readonly<TSESLint.RuleContext<MessageIds, []>>;

function isDirectStoreOrReturn(node: TSESTree.Node): boolean {
  const { parent } = node;
  if (parent === undefined || isObjectAssignTarget(node)) {
    return false;
  }
  if (
    parent.type === AST_NODE_TYPES.ReturnStatement ||
    (parent.type === AST_NODE_TYPES.ArrowFunctionExpression && parent.body === node)
  ) {
    return true;
  }
  if (parent.type === AST_NODE_TYPES.Property && parent.value === node) {
    return true;
  }
  if (parent.type === AST_NODE_TYPES.ArrayExpression) {
    return true;
  }
  if (parent.type === AST_NODE_TYPES.AssignmentExpression && parent.right === node) {
    return parent.left.type === AST_NODE_TYPES.MemberExpression;
  }
  return (
    parent.type === AST_NODE_TYPES.CallExpression &&
    parent.arguments.some((argument) => argument === node)
  );
}

function isStoredOrReturnedUnmutated(
  sourceCode: SourceCode,
  copyNode: TSESTree.Node,
  boundary: TSESTree.Node,
): boolean {
  const top = wrapperTop(copyNode);
  if (isDirectStoreOrReturn(top)) {
    return true;
  }
  const { parent } = top;
  if (
    parent?.type !== AST_NODE_TYPES.VariableDeclarator ||
    parent.init !== top ||
    parent.id.type !== AST_NODE_TYPES.Identifier
  ) {
    return false;
  }
  if (isMutatedInBoundary(parent.id.name, boundary)) {
    return false;
  }
  const variable = variableNamed(sourceCode, parent.id);
  if (variable === undefined) {
    return false;
  }
  return variable.references.some(
    (reference) =>
      reference.identifier !== parent.id &&
      !reference.isWrite() &&
      contains(boundary, reference.identifier) &&
      isDirectStoreOrReturn(wrapperTop(reference.identifier)),
  );
}

function checkCopy(context: Context, node: CopyNode): void {
  const source = copiedSourceOf(node);
  if (source === undefined || isSmallConstantValue(context.sourceCode, source)) {
    return;
  }
  const repeat = innermostRepeat(node);
  if (repeat === undefined || isSmallOrSkippedRepeat(context.sourceCode, repeat)) {
    return;
  }
  const rootName = rootIdentifierName(source);
  if (
    rootName === undefined ||
    !invariantIn(context.sourceCode, source, repeat.node) ||
    isMutatedInBoundary(rootName, repeat.node)
  ) {
    return;
  }
  if (isStoredOrReturnedUnmutated(context.sourceCode, node, repeat.node)) {
    context.report({ node, messageId: 'loopInvariantCopy' });
  }
}

export const rule: TSESLint.RuleModule<MessageIds, []> = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Avoid copying a loop-invariant collection on every iteration when the copy is not mutated',
    },
    schema: [],
    messages: {
      loopInvariantCopy:
        'Copying a loop-invariant collection on every iteration multiplies memory and CPU when both the loop and the copied collection can be large. Share the reference directly or pass a readonly view instead.',
    },
  },
  create(context) {
    if (isTestFile(context.filename)) {
      return {};
    }
    return {
      ArrayExpression(node: TSESTree.ArrayExpression) {
        checkCopy(context, node);
      },
      ObjectExpression(node: TSESTree.ObjectExpression) {
        checkCopy(context, node);
      },
      CallExpression(node: TSESTree.CallExpression) {
        checkCopy(context, node);
      },
      NewExpression(node: TSESTree.NewExpression) {
        checkCopy(context, node);
      },
    };
  },
};
