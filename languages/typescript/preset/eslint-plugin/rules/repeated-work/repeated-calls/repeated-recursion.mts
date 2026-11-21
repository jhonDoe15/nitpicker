import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { outerOf, someNode } from '../../collections/costly-forms/repeated-runs.mts';
import { ancestorsOf, variableNamed, type SourceCode } from '../../typed/node-views.mts';
import { isFunction, unwrapped, type FunctionNode } from '../../typed/syntax-views.mts';
import { readsMemo } from '../support/loop-invariance.mts';
import { isSettled, isVerb, sameCall } from './call-shapes.mts';
import type { Pair } from './tested-then-used.mts';

const DISCARDED = new Set<string>([
  AST_NODE_TYPES.ExpressionStatement,
  AST_NODE_TYPES.SequenceExpression,
]);

function functionName(fn: FunctionNode): TSESTree.Identifier | undefined {
  if (fn.id !== null && fn.id !== undefined) {
    return fn.id;
  }
  const declarator = outerOf(fn).parent;
  return declarator?.type === AST_NODE_TYPES.VariableDeclarator &&
    declarator.id.type === AST_NODE_TYPES.Identifier
    ? declarator.id
    : undefined;
}

function branchPath(call: TSESTree.Node, fn: FunctionNode): string[] {
  const chain = [call, ...ancestorsOf(call)];
  const stop = chain.indexOf(fn);
  return chain.slice(1, stop).flatMap((ancestor, index) => {
    const child = chain[index];
    const branching =
      (ancestor.type === AST_NODE_TYPES.IfStatement && child !== ancestor.test) ||
      (ancestor.type === AST_NODE_TYPES.ConditionalExpression && child !== ancestor.test) ||
      (ancestor.type === AST_NODE_TYPES.LogicalExpression && child === ancestor.right) ||
      ancestor.type === AST_NODE_TYPES.SwitchCase ||
      ancestor.type === AST_NODE_TYPES.CatchClause;
    return branching && child !== undefined
      ? [`${String(ancestor.range[0])}:${String(child.range[0])}`]
      : [];
  });
}

function writtenIn(sourceCode: SourceCode, argument: TSESTree.Node, fn: FunctionNode): boolean {
  return someNode(argument, (node) => {
    if (node.type !== AST_NODE_TYPES.Identifier) {
      return false;
    }
    const variable = variableNamed(sourceCode, node);
    return (variable?.references ?? []).some(
      (reference) =>
        reference.isWrite() && !reference.init && ancestorsOf(reference.identifier).includes(fn),
    );
  });
}

function isMemoized(fn: FunctionNode, names: ReadonlySet<string>): boolean {
  return readsMemo(fn.body, (argument) =>
    someNode(
      argument,
      (child) => child.type === AST_NODE_TYPES.Identifier && names.has(child.name),
    ),
  );
}

function writesOutside(sourceCode: SourceCode, target: TSESTree.Node, fn: FunctionNode): boolean {
  const value = unwrapped(target);
  if (value.type !== AST_NODE_TYPES.Identifier) {
    return true;
  }
  const definition = variableNamed(sourceCode, value)?.defs[0];
  return definition === undefined || !ancestorsOf(definition.name).includes(fn);
}

function sharesState(sourceCode: SourceCode, fn: FunctionNode): boolean {
  return someNode(fn.body, (node) => {
    if (node.type === AST_NODE_TYPES.AssignmentExpression) {
      return writesOutside(sourceCode, node.left, fn);
    }
    if (node.type === AST_NODE_TYPES.UpdateExpression) {
      return writesOutside(sourceCode, node.argument, fn);
    }
    const callee = node.type === AST_NODE_TYPES.CallExpression ? unwrapped(node.callee) : undefined;
    return (
      callee?.type === AST_NODE_TYPES.MemberExpression &&
      callee.property.type === AST_NODE_TYPES.Identifier &&
      isVerb(callee.property.name)
    );
  });
}

function argumentNames(call: TSESTree.CallExpression): Set<string> {
  const names = new Set<string>();
  for (const argument of call.arguments) {
    someNode(argument, (node) => {
      if (node.type === AST_NODE_TYPES.Identifier) {
        names.add(node.name);
      }
      return false;
    });
  }
  return names;
}

function selfCalls(fn: FunctionNode, name: string): TSESTree.CallExpression[] {
  const calls: TSESTree.CallExpression[] = [];
  someNode(fn.body, (node) => {
    if (
      node.type === AST_NODE_TYPES.CallExpression &&
      unwrapped(node.callee).type === AST_NODE_TYPES.Identifier &&
      (unwrapped(node.callee) as TSESTree.Identifier).name === name &&
      ancestorsOf(node).find(isFunction) === fn &&
      !DISCARDED.has(outerOf(node).parent?.type ?? '')
    ) {
      calls.push(node);
    }
    return false;
  });
  return calls;
}

export function repeatedRecursion(sourceCode: SourceCode, fn: FunctionNode): Pair | undefined {
  const name = functionName(fn);
  if (name === undefined || sharesState(sourceCode, fn)) {
    return undefined;
  }
  const calls = selfCalls(fn, name.name).filter(
    (call) =>
      call.arguments.length > 0 &&
      call.arguments.every(
        (argument) => isSettled(argument) && !writtenIn(sourceCode, argument, fn),
      ),
  );
  for (const [index, first] of calls.entries()) {
    const path = branchPath(first, fn).join('|');
    const second = calls
      .slice(index + 1)
      .find((call) => sameCall(sourceCode, first, call) && branchPath(call, fn).join('|') === path);
    if (second !== undefined && !isMemoized(fn, argumentNames(first))) {
      return { first, second };
    }
  }
  return undefined;
}
