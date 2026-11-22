import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  isCollectionExpression,
  isCollectionMapVariable,
  outerLoopHasCollectionMapElements,
} from './collection-map-types.mts';
import { memberName } from '../costly-forms/repeated-runs.mts';
import {
  ancestorsOf,
  contains,
  depthFirst,
  nodeChildren,
  variableNamed,
  type SourceCode,
} from '../../typed/node-views.mts';
import { isTestFile } from '../../analysis/test-files/test-file-path.mts';
import { unwrapped } from '../../typed/syntax-views.mts';

type RuleContext = TSESLint.RuleContext<'overwriteCollectionMapMerge', []>;

function isLoopNode(node: TSESTree.Node): boolean {
  if (
    node.type === AST_NODE_TYPES.ForStatement ||
    node.type === AST_NODE_TYPES.ForOfStatement ||
    node.type === AST_NODE_TYPES.ForInStatement
  ) {
    return true;
  }
  if (
    (node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
      node.type === AST_NODE_TYPES.FunctionExpression) &&
    node.parent?.type === AST_NODE_TYPES.CallExpression &&
    node.parent.arguments[0] === node
  ) {
    const callee = unwrapped(node.parent.callee);
    return callee.type === AST_NODE_TYPES.MemberExpression && memberName(callee) === 'forEach';
  }
  return false;
}

function enclosingLoops(node: TSESTree.Node): TSESTree.Node[] {
  const loops: TSESTree.Node[] = [];
  for (const ancestor of ancestorsOf(node)) {
    if (isLoopNode(ancestor)) {
      loops.push(ancestor);
      continue;
    }
    if (
      ancestor.type === AST_NODE_TYPES.FunctionDeclaration ||
      ancestor.type === AST_NODE_TYPES.FunctionExpression ||
      ancestor.type === AST_NODE_TYPES.ArrowFunctionExpression
    ) {
      break;
    }
  }
  return loops;
}

function declaredOutside(
  sourceCode: SourceCode,
  target: TSESTree.Identifier,
  outerLoop: TSESTree.Node,
): boolean {
  const def = variableNamed(sourceCode, target)?.defs[0];
  return def !== undefined && !contains(outerLoop, def.node);
}

function isTargetRead(node: TSESTree.Node, targetName: string, writeNode: TSESTree.Node): boolean {
  if (node === writeNode || node.type !== AST_NODE_TYPES.MemberExpression) {
    return false;
  }
  if (node.object.type !== AST_NODE_TYPES.Identifier || node.object.name !== targetName) {
    return false;
  }
  const method = memberName(node);
  return method === 'get' || method === 'has' || node.computed;
}

function readsTargetKeyInLoop(
  loop: TSESTree.Node,
  targetName: string,
  writeNode: TSESTree.Node,
): boolean {
  for (const node of depthFirst(loop, nodeChildren)) {
    if (isTargetRead(node, targetName, writeNode)) {
      return true;
    }
  }
  return false;
}

function isSpreadMergeAssignment(
  node: TSESTree.AssignmentExpression,
): TSESTree.Identifier | undefined {
  if (
    node.operator !== '=' ||
    node.left.type !== AST_NODE_TYPES.Identifier ||
    node.right.type !== AST_NODE_TYPES.ObjectExpression
  ) {
    return undefined;
  }
  const spreads = node.right.properties.filter(
    (prop): prop is TSESTree.SpreadElement => prop.type === AST_NODE_TYPES.SpreadElement,
  );
  const targetName = node.left.name;
  const spreadsSelf = spreads.some(
    (prop) => prop.argument.type === AST_NODE_TYPES.Identifier && prop.argument.name === targetName,
  );
  return spreadsSelf && spreads.length >= 2 ? node.left : undefined;
}

function reportIfCollectionMap(
  context: RuleContext,
  node: TSESTree.Node,
  target: TSESTree.Identifier,
): void {
  const [loop] = enclosingLoops(node);
  if (loop === undefined || !declaredOutside(context.sourceCode, target, loop)) {
    return;
  }
  const isCollectionMap =
    isCollectionMapVariable(context.sourceCode, target) ||
    outerLoopHasCollectionMapElements(context.sourceCode, loop);
  if (isCollectionMap) {
    context.report({
      node,
      messageId: 'overwriteCollectionMapMerge',
      data: { name: target.name },
    });
  }
}

function checkNestedOverwrite(
  context: RuleContext,
  node: TSESTree.Node,
  details: {
    readonly target: TSESTree.Identifier;
    readonly valueArg: TSESTree.Node | undefined;
    readonly writeMember: TSESTree.Node;
  },
): void {
  const [innerLoop, outerLoop] = enclosingLoops(node);
  if (innerLoop === undefined || outerLoop === undefined) {
    return;
  }
  const { target, valueArg, writeMember } = details;
  const isCollectionMap =
    isCollectionMapVariable(context.sourceCode, target) ||
    outerLoopHasCollectionMapElements(context.sourceCode, outerLoop) ||
    (valueArg !== undefined && isCollectionExpression(valueArg));
  if (
    !isCollectionMap ||
    !declaredOutside(context.sourceCode, target, outerLoop) ||
    readsTargetKeyInLoop(innerLoop, target.name, writeMember)
  ) {
    return;
  }
  context.report({
    node,
    messageId: 'overwriteCollectionMapMerge',
    data: { name: target.name },
  });
}

function checkMapSetCall(context: RuleContext, call: TSESTree.CallExpression): void {
  const callee = unwrapped(call.callee);
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    memberName(callee) !== 'set' ||
    callee.object.type !== AST_NODE_TYPES.Identifier ||
    call.arguments.length < 2
  ) {
    return;
  }
  checkNestedOverwrite(context, call, {
    target: callee.object,
    valueArg: call.arguments[1],
    writeMember: callee,
  });
}

function checkObjectAssignCall(context: RuleContext, call: TSESTree.CallExpression): void {
  const callee = unwrapped(call.callee);
  const [target, source] = call.arguments;
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    callee.object.type !== AST_NODE_TYPES.Identifier ||
    callee.object.name !== 'Object' ||
    memberName(callee) !== 'assign' ||
    target?.type !== AST_NODE_TYPES.Identifier ||
    source === undefined
  ) {
    return;
  }
  reportIfCollectionMap(context, call, target);
}

function checkAssignment(context: RuleContext, assignment: TSESTree.AssignmentExpression): void {
  const spreadTarget = isSpreadMergeAssignment(assignment);
  if (spreadTarget !== undefined) {
    reportIfCollectionMap(context, assignment, spreadTarget);
    return;
  }
  if (
    assignment.operator === '=' &&
    assignment.left.type === AST_NODE_TYPES.MemberExpression &&
    assignment.left.computed &&
    assignment.left.object.type === AST_NODE_TYPES.Identifier
  ) {
    checkNestedOverwrite(context, assignment, {
      target: assignment.left.object,
      valueArg: assignment.right,
      writeMember: assignment.left,
    });
  }
}

export const rule: TSESLint.RuleModule<'overwriteCollectionMapMerge'> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow overwriting keys when merging multiple maps whose values are collections',
    },
    schema: [],
    messages: {
      overwriteCollectionMapMerge:
        "Overwriting keys in collection-valued map '{{name}}' inside a merge loop drops values from earlier sources when two sources share a key. Merge the collections for existing keys instead.",
    },
  },
  create(context) {
    if (isTestFile(context.filename)) {
      return {};
    }
    return {
      CallExpression(call) {
        checkMapSetCall(context, call);
        checkObjectAssignCall(context, call);
      },
      AssignmentExpression(assignment) {
        checkAssignment(context, assignment);
      },
    };
  },
};
