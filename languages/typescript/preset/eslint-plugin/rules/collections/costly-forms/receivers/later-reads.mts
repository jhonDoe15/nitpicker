import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  ancestorsOf,
  contains,
  type SourceCode,
  variableNamed,
} from '../../../typed/node-views.mts';
import { enclosingFunction, isFunction } from '../../../typed/syntax-views.mts';
import { LOOP_TYPES, plainAssignmentStatement } from '../../spread-shapes.mts';

function loopsAround(node: TSESTree.Node): TSESTree.Node[] {
  const loops: TSESTree.Node[] = [];
  for (const ancestor of ancestorsOf(node)) {
    if (isFunction(ancestor)) {
      return loops;
    }
    if (LOOP_TYPES.has(ancestor.type)) {
      loops.push(ancestor);
    }
  }
  return loops;
}

function statementOf(node: TSESTree.Node): TSESTree.Node | undefined {
  return [node, ...ancestorsOf(node)].find(
    (candidate) =>
      candidate.parent?.type === AST_NODE_TYPES.BlockStatement ||
      candidate.parent?.type === AST_NODE_TYPES.Program,
  );
}

function replacedBefore(
  call: TSESTree.CallExpression,
  read: TSESLint.Scope.Reference,
  writes: readonly TSESLint.Scope.Reference[],
): boolean {
  const statement = statementOf(call);
  return writes.some((write) => {
    const assignment = plainAssignmentStatement(write.identifier);
    const sibling = assignment?.parent;
    return (
      assignment !== undefined &&
      sibling !== undefined &&
      statement !== undefined &&
      sibling.parent === statement.parent &&
      sibling.range[0] >= statement.range[1] &&
      !contains(sibling, call) &&
      read.identifier.range[0] >= assignment.range[1]
    );
  });
}

function runsAfter(
  call: TSESTree.CallExpression,
  variable: TSESLint.Scope.Variable,
  read: TSESLint.Scope.Reference,
): boolean {
  const declaration = variable.defs[0]?.node;
  const repeated = loopsAround(call).some(
    (loop) =>
      contains(loop, read.identifier) &&
      (declaration === undefined || !contains(loop, declaration)),
  );
  return repeated || read.identifier.range[0] >= call.range[1];
}

export function isReadAfterSort(
  sourceCode: SourceCode,
  receiver: TSESTree.Identifier,
  call: TSESTree.CallExpression,
): boolean {
  const variable = variableNamed(sourceCode, receiver);
  if (variable === undefined) {
    return true;
  }
  const references = variable.references.filter(
    (reference) => !reference.init && reference.identifier !== receiver,
  );
  const reads = references.filter((reference) => reference.isRead());
  const writes = references.filter((reference) => reference.isWrite());
  const owner = enclosingFunction(call);
  const shared = owner !== enclosingFunction(variable.identifiers[0] ?? call);
  return reads.some((read) => {
    if (shared || enclosingFunction(read.identifier) !== owner) {
      return true;
    }
    return runsAfter(call, variable, read) && !replacedBefore(call, read, writes);
  });
}
