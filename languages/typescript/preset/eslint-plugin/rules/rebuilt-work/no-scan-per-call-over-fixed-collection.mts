import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type { SourceContext } from '../analysis/constant-resolution.mts';
import { innermostRepeat } from '../repeated-work/support/loop-invariance.mts';
import { depthFirst, nameOf, nodeChildren } from '../typed/node-views.mts';
import { enclosingFunction, isFunction, type FunctionNode } from '../typed/syntax-views.mts';
import { calledRepeatedly } from './call-sites.mts';
import { fixedSource } from './fixed-sources.mts';

const SCANS = new Set(['find', 'findIndex', 'findLast', 'findLastIndex', 'some', 'filter']);
const EQUALITY = new Set(['===', '==']);

function isPropertyName(node: TSESTree.Identifier): boolean {
  const { parent } = node;
  return (
    (parent?.type === AST_NODE_TYPES.MemberExpression &&
      parent.property === node &&
      !parent.computed) ||
    (parent?.type === AST_NODE_TYPES.Property &&
      parent.key === node &&
      !parent.computed &&
      !parent.shorthand)
  );
}

function namesIn(node: TSESTree.Node): Set<string> {
  const names = [...depthFirst<TSESTree.Node>(node, nodeChildren)].flatMap((inner) =>
    inner.type === AST_NODE_TYPES.Identifier && !isPropertyName(inner) ? [inner.name] : [],
  );
  return new Set(names);
}

function reads(node: TSESTree.Node, names: ReadonlySet<string>): boolean {
  return [...namesIn(node)].some((name) => names.has(name));
}

function comparesParameter(
  test: TSESTree.Node | null | undefined,
  element: ReadonlySet<string>,
  parameters: ReadonlySet<string>,
): boolean {
  if (test?.type !== AST_NODE_TYPES.BinaryExpression || !EQUALITY.has(test.operator)) {
    return false;
  }
  const sides = [test.left, test.right];
  return sides.some(
    (side, index) =>
      reads(side, element) &&
      [sides[1 - index]].some(
        (other) => other !== undefined && !reads(other, element) && reads(other, parameters),
      ),
  );
}

function callbackTest(callback: TSESTree.Node | undefined): TSESTree.Node | undefined {
  if (
    (callback?.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
      callback?.type !== AST_NODE_TYPES.FunctionExpression) ||
    callback.params.length !== 1
  ) {
    return undefined;
  }
  const { body } = callback;
  if (body.type !== AST_NODE_TYPES.BlockStatement) {
    return body;
  }
  const [only] = body.body;
  return body.body.length === 1 && only?.type === AST_NODE_TYPES.ReturnStatement
    ? (only.argument ?? undefined)
    : undefined;
}

function parameterNames(fn: FunctionNode): Set<string> {
  return new Set(fn.params.flatMap((param) => [...namesIn(param)]));
}

function scannedByCall(
  node: TSESTree.CallExpression,
  parameters: ReadonlySet<string>,
): TSESTree.Node | undefined {
  const { callee } = node;
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    !SCANS.has(nameOf(callee.property) ?? '')
  ) {
    return undefined;
  }
  const [callback] = node.arguments;
  const element =
    callback === undefined || !isFunction(callback) ? new Set<string>() : parameterNames(callback);
  return comparesParameter(callbackTest(callback), element, parameters) ? callee.object : undefined;
}

function scannedByLoop(
  node: TSESTree.ForOfStatement,
  parameters: ReadonlySet<string>,
): TSESTree.Node | undefined {
  const element = namesIn(node.left);
  const returns = [...depthFirst<TSESTree.Node>(node.body, nodeChildren)].some(
    (inner) =>
      inner.type === AST_NODE_TYPES.IfStatement &&
      comparesParameter(inner.test, element, parameters) &&
      [...depthFirst<TSESTree.Node>(inner.consequent, nodeChildren)].some(
        (exit) => exit.type === AST_NODE_TYPES.ReturnStatement,
      ),
  );
  return returns ? node.right : undefined;
}

function check(
  context: SourceContext,
  node: TSESTree.CallExpression | TSESTree.ForOfStatement,
): boolean {
  const fn = enclosingFunction(node);
  if (fn === undefined || innermostRepeat(node) !== undefined) {
    return false;
  }
  const parameters = parameterNames(fn);
  const scanned =
    node.type === AST_NODE_TYPES.CallExpression
      ? scannedByCall(node, parameters)
      : scannedByLoop(node, parameters);
  return (
    scanned !== undefined &&
    !reads(scanned, parameters) &&
    fixedSource(context, scanned) &&
    calledRepeatedly(context, fn)
  );
}

export const rule: TSESLint.RuleModule<'scanPerCall'> = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow scanning an unchanging collection for a parameter in a function called from a loop or many places',
    },
    schema: [],
    messages: {
      scanPerCall:
        'This function scans every element of a collection that does not change after it is set up, looking for one that matches its parameter, and it runs from a loop or from many call sites, so each call repeats the whole scan. Build an index once (a Map from the compared value to the element, filled where the collection is filled) and look the parameter up in it.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (check(context, node)) {
          context.report({ node, messageId: 'scanPerCall' });
        }
      },
      ForOfStatement(node) {
        if (check(context, node)) {
          context.report({ node, messageId: 'scanPerCall' });
        }
      },
    };
  },
};
