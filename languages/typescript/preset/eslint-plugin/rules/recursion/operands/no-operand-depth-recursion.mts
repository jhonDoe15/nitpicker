import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, nameOf } from '../../typed/node-views.mts';
import { calledKey, descendants, fileCalls, type FileFunction } from '../graph/file-calls.mts';

type MessageIds = 'operandRecursion';

const OPERAND_PAIRS: readonly (readonly [string, string])[] = [
  ['left', 'right'],
  ['lhs', 'rhs'],
];
const DEPTH_NAME = /depth|level|limit|remaining|budget/iu;
const OPERAND_CONTEXT = /operator|binary|infix|operand/iu;
const RELATIONS = new Set(['<', '<=', '>', '>=']);
const CALLABLES = new Set<string>([
  AST_NODE_TYPES.ArrowFunctionExpression,
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.FunctionDeclaration,
]);

function operandKey(root: string, property: string): string {
  return JSON.stringify([root, property]);
}

function operandOf(argument: TSESTree.Node, params: ReadonlySet<string>): string | undefined {
  const inner =
    argument.type === AST_NODE_TYPES.TSAsExpression ||
    argument.type === AST_NODE_TYPES.TSNonNullExpression
      ? argument.expression
      : argument;
  if (inner.type !== AST_NODE_TYPES.MemberExpression || inner.computed) {
    return undefined;
  }
  const root = nameOf(inner.object);
  const property = nameOf(inner.property);
  return root !== undefined && params.has(root) && property !== undefined
    ? operandKey(root, property)
    : undefined;
}

function selfCalls(fn: FileFunction): TSESTree.CallExpression[] {
  return descendants(fn.node.body).filter(
    (node): node is TSESTree.CallExpression =>
      node.type === AST_NODE_TYPES.CallExpression && calledKey(node, fn.owner) === fn.key,
  );
}

function shadowed(call: TSESTree.CallExpression, fn: FileFunction): Set<string> {
  const inside = ancestorsOf(call);
  return new Set(
    inside
      .slice(0, inside.indexOf(fn.node))
      .flatMap((node) =>
        CALLABLES.has(node.type) && 'params' in node
          ? node.params.flatMap((param) => nameOf(param) ?? [])
          : [],
      ),
  );
}

function operandCalls(fn: FileFunction): Map<string, TSESTree.CallExpression> {
  const found = new Map<string, TSESTree.CallExpression>();
  for (const call of selfCalls(fn)) {
    const hidden = shadowed(call, fn);
    const params = new Set([...fn.params].filter((name) => !hidden.has(name)));
    for (const operand of call.arguments.flatMap((argument) => operandOf(argument, params) ?? [])) {
      found.set(operand, found.get(operand) ?? call);
    }
  }
  return found;
}

function comparesParam(fn: FileFunction): boolean {
  return descendants(fn.node.body).some(
    (node) =>
      node.type === AST_NODE_TYPES.BinaryExpression &&
      RELATIONS.has(node.operator) &&
      [node.left, node.right].some((side) => fn.params.has(nameOf(side) ?? '')),
  );
}

function chainCall(fn: FileFunction, text: string): TSESTree.CallExpression | undefined {
  if (
    !OPERAND_CONTEXT.test(text) ||
    [...fn.params].some((name) => DEPTH_NAME.test(name)) ||
    comparesParam(fn)
  ) {
    return undefined;
  }
  const calls = operandCalls(fn);
  const roots = [...fn.params];
  for (const [first, second] of OPERAND_PAIRS) {
    const root = roots.find(
      (name) => calls.has(operandKey(name, first)) && calls.has(operandKey(name, second)),
    );
    if (root !== undefined) {
      return calls.get(operandKey(root, first));
    }
  }
  return undefined;
}

export const rule: TSESLint.RuleModule<MessageIds> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow recursion into both operands of a node with no depth limit, whose depth follows the input',
    },
    schema: [],
    messages: {
      operandRecursion:
        "'{{name}}' calls itself on both operands of its input expression, so the call stack grows with the length of an operand chain. Generated code (a string of thousands of `+` operands, a long `else if` ladder, a builder chain) nests far deeper than hand-written tests, and the walk ends in a stack overflow that no caller catches. Walk the left-leaning chain in a loop and recurse only into the right operand, use an explicit stack, or pass a depth and stop with an ordinary error past a limit.",
    },
  },
  create(context) {
    return {
      'Program:exit'(program: TSESTree.Program) {
        for (const fn of fileCalls(program).functions.values()) {
          const call = chainCall(fn, context.sourceCode.getText(fn.node));
          if (call !== undefined) {
            context.report({ node: call, messageId: 'operandRecursion', data: { name: fn.name } });
          }
        }
      },
    };
  },
};
