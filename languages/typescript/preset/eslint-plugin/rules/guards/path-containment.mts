import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  isFunctionNode,
  resolveConstant,
  stringValue,
  type SourceContext,
} from '../analysis/constant-resolution.mts';
import { importedCalleeName, type ModuleBindings } from '../analysis/subprocess-calls.mts';
import {
  ancestorsOf,
  chainOf,
  depthFirst,
  isNode,
  nameOf,
  variableNamed,
  type SourceCode,
} from '../typed/node-views.mts';
import { unwrapOf } from '../typed/syntax-views.mts';

type Node = TSESTree.Node;
const INSIDE = 'inside';
const OUTSIDE = 'outside';

type Containment = typeof INSIDE | typeof OUTSIDE;
export type ContainmentScope = {
  readonly context: SourceContext;
  readonly sourceCode: SourceCode;
  readonly pathModule: ModuleBindings;
};
type Check = ContainmentScope & { readonly variable: TSESLint.Scope.Variable };

export const CONTAINMENT_WRAPPERS = [
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.TSNonNullExpression,
  AST_NODE_TYPES.TSSatisfiesExpression,
  AST_NODE_TYPES.ChainExpression,
];
const EXITS = new Set<string>([
  'ReturnStatement',
  'ThrowStatement',
  'ContinueStatement',
  'BreakStatement',
]);

function lastPiece(scope: ContainmentScope, node: Node): Node | undefined {
  const resolved = resolveConstant(scope.context, node);
  if (resolved?.type === AST_NODE_TYPES.BinaryExpression && resolved.operator === '+') {
    return resolved.right;
  }
  const endsWithExpression =
    resolved?.type === AST_NODE_TYPES.TemplateLiteral &&
    resolved.quasis.at(-1)?.value.cooked === '';
  return endsWithExpression ? resolved.expressions.at(-1) : undefined;
}

function endsWithSeparator(scope: ContainmentScope, node: Node): boolean {
  const last = resolveConstant(
    scope.context,
    chainOf<Node>(node, (piece) => lastPiece(scope, piece)).at(-1),
  );
  if (last === undefined) {
    return false;
  }
  const text =
    last.type === AST_NODE_TYPES.TemplateLiteral
      ? last.quasis.at(-1)?.value.cooked
      : stringValue(last);
  return importedCalleeName(last, scope.pathModule) === 'sep' || /[\\/]$/.test(text ?? '');
}

function isPathOf(check: Check, node: Node): boolean {
  const expression = unwrapOf(node, CONTAINMENT_WRAPPERS);
  const callee =
    expression.type === AST_NODE_TYPES.CallExpression
      ? importedCalleeName(expression.callee, check.pathModule)
      : undefined;
  const target =
    expression.type === AST_NODE_TYPES.CallExpression &&
    expression.arguments.length === 1 &&
    callee !== undefined &&
    ['resolve', 'normalize'].includes(callee)
      ? unwrapOf(expression.arguments[0], CONTAINMENT_WRAPPERS)
      : expression;
  return (
    target?.type === AST_NODE_TYPES.Identifier &&
    variableNamed(check.sourceCode, target) === check.variable
  );
}

function isRelativeOf(check: Check, node: Node): boolean {
  const call = unwrapOf(
    resolveConstant(check.context, unwrapOf(node, CONTAINMENT_WRAPPERS)),
    CONTAINMENT_WRAPPERS,
  );
  return (
    call?.type === AST_NODE_TYPES.CallExpression &&
    importedCalleeName(call.callee, check.pathModule) === 'relative' &&
    call.arguments[1] !== undefined &&
    isPathOf(check, call.arguments[1])
  );
}

function directContainment(check: Check, node: Node): Containment | undefined {
  const call = unwrapOf(node, CONTAINMENT_WRAPPERS);
  if (
    call.type !== AST_NODE_TYPES.CallExpression ||
    call.callee.type !== AST_NODE_TYPES.MemberExpression ||
    call.callee.computed ||
    nameOf(call.callee.property) !== 'startsWith'
  ) {
    return undefined;
  }
  const [prefix] = call.arguments;
  if (prefix === undefined) {
    return undefined;
  }
  const receiver = call.callee.object;
  if (isPathOf(check, receiver) && endsWithSeparator(check, prefix)) {
    return INSIDE;
  }
  const escapes = stringValue(resolveConstant(check.context, prefix)) === '..';
  return escapes && isRelativeOf(check, receiver) ? OUTSIDE : undefined;
}

const NEGATED: Record<Containment, Containment> = { [INSIDE]: OUTSIDE, [OUTSIDE]: INSIDE };

function containment(check: Check, node: Node): Containment | undefined {
  const test = unwrapOf(node, CONTAINMENT_WRAPPERS);
  if (test.type === AST_NODE_TYPES.UnaryExpression && test.operator === '!') {
    const direct = directContainment(check, test.argument);
    return direct === undefined ? undefined : NEGATED[direct];
  }
  return directContainment(check, test);
}

function logicalOperands(test: Node, operator: string): Node[] {
  function joins(node: Node): node is TSESTree.LogicalExpression {
    return node.type === AST_NODE_TYPES.LogicalExpression && node.operator === operator;
  }
  function children(node: Node): Node[] {
    return joins(node) ? [node.left, node.right] : [];
  }
  return [...depthFirst<Node>(test, children)].filter((node) => !joins(node));
}

function checksBefore(check: Check, statements: readonly Node[], child: Node): boolean {
  const earlier = statements.slice(0, Math.max(statements.indexOf(child), 0));
  return earlier.some((statement) => {
    if (statement.type !== AST_NODE_TYPES.IfStatement) {
      return false;
    }
    const last =
      statement.consequent.type === AST_NODE_TYPES.BlockStatement
        ? statement.consequent.body.at(-1)
        : statement.consequent;
    return (
      last !== undefined &&
      EXITS.has(last.type) &&
      logicalOperands(statement.test, '||').some(
        (operand) => containment(check, operand) === OUTSIDE,
      )
    );
  });
}

function isNodeList(value: unknown): value is Node[] {
  return Array.isArray(value) && value.every(isNode);
}

function guards(check: Check, node: Node, child: Node): boolean {
  if (node.type === AST_NODE_TYPES.IfStatement && node.consequent === child) {
    const operands = logicalOperands(node.test, '&&');
    return operands.some((operand) => containment(check, operand) === INSIDE);
  }
  const statements: unknown =
    node.type === AST_NODE_TYPES.SwitchCase ? node.consequent : Reflect.get(node, 'body');
  return isNodeList(statements) && checksBefore(check, statements, child);
}

export function isContained(scope: ContainmentScope, sink: Node, argument: Node): boolean {
  const target = unwrapOf(argument, CONTAINMENT_WRAPPERS);
  const variable =
    target.type === AST_NODE_TYPES.Identifier ? variableNamed(scope.sourceCode, target) : undefined;
  if (variable === undefined) {
    return false;
  }
  const path = [sink, ...ancestorsOf(sink)];
  const ownerIndex = path.findIndex(isFunctionNode);
  const within = ownerIndex === -1 ? path : path.slice(0, ownerIndex + 1);
  const check = { ...scope, variable };
  return within.some((node, index) => {
    const child = within[index - 1];
    return child !== undefined && guards(check, node, child);
  });
}
