import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, nameOf, type SourceCode } from '../../typed/node-views.mts';
import {
  functionName,
  isCloseName,
  isFunctionNode,
  unwrapExpression,
  type FunctionNode,
} from '../scope/close-scopes.mts';

type Step =
  | TSESTree.Statement
  | { readonly type: AST_NODE_TYPES.ExpressionStatement; readonly expression: TSESTree.Expression };

const RELEASE_METHODS = new Set<string>([
  'close',
  'disconnect',
  'destroy',
  'end',
  'quit',
  'stop',
  'terminate',
  'unsubscribe',
  'dispose',
]);
const TEST_HOOKS = new Set<string>(['afterAll', 'afterEach', 'after']);
const SHUTDOWN_HOOKS = new Set<string>(['onClose', 'onShutdown', 'onExit']);
const SIGNALS = new Set<string>(['SIGTERM', 'SIGINT', 'SIGHUP', 'beforeExit']);
const RESET_VALUES = new Set<string>([
  AST_NODE_TYPES.Literal,
  AST_NODE_TYPES.NewExpression,
  AST_NODE_TYPES.ArrayExpression,
  AST_NODE_TYPES.ObjectExpression,
]);

function calleeName(callee: TSESTree.Node): string | undefined {
  return nameOf(callee.type === AST_NODE_TYPES.MemberExpression ? callee.property : callee);
}

function hookCallback(fn: FunctionNode): boolean {
  const call = fn.parent;
  if (call.type !== AST_NODE_TYPES.CallExpression || !call.arguments.some((each) => each === fn)) {
    return false;
  }
  const name = calleeName(call.callee) ?? '';
  const [first] = call.arguments;
  return (
    TEST_HOOKS.has(name) ||
    SHUTDOWN_HOOKS.has(name) ||
    (name === 'addHook' &&
      first?.type === AST_NODE_TYPES.Literal &&
      typeof first.value === 'string' &&
      SHUTDOWN_HOOKS.has(first.value)) ||
    (['on', 'once'].includes(name) &&
      first?.type === AST_NODE_TYPES.Literal &&
      typeof first.value === 'string' &&
      SIGNALS.has(first.value))
  );
}

export function isCleanupFunction(fn: FunctionNode): boolean {
  return isCloseName(functionName(fn)) || hookCallback(fn);
}

export function nearestFunction(node: TSESTree.Node): FunctionNode | undefined {
  return ancestorsOf(node).find(isFunctionNode);
}

export function releaseCall(expression: TSESTree.Node): TSESTree.CallExpression | undefined {
  const call = unwrapExpression(expression);
  if (call.type !== AST_NODE_TYPES.CallExpression) {
    return undefined;
  }
  const callee = unwrapExpression(call.callee);
  return callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    RELEASE_METHODS.has(nameOf(callee.property) ?? '')
    ? call
    : undefined;
}

function singleStatement(statement: TSESTree.Statement): TSESTree.Statement {
  return statement.type === AST_NODE_TYPES.BlockStatement && statement.body.length === 1
    ? (statement.body[0] ?? statement)
    : statement;
}

const NESTING = [0, 1, 2, 3];

function innerStatement(statement: Step): Step | undefined {
  if (statement.type === AST_NODE_TYPES.IfStatement && statement.alternate === null) {
    return singleStatement(statement.consequent);
  }
  if (
    statement.type === AST_NODE_TYPES.ForOfStatement ||
    statement.type === AST_NODE_TYPES.ForInStatement
  ) {
    return singleStatement(statement.body);
  }
  if (statement.type === AST_NODE_TYPES.ReturnStatement && statement.argument !== null) {
    return { type: AST_NODE_TYPES.ExpressionStatement, expression: statement.argument };
  }
  return undefined;
}

function stepStatement(statement: TSESTree.Statement): Step {
  return NESTING.reduce<Step>((step) => innerStatement(step) ?? step, statement);
}

export function firstRelease(statement: TSESTree.Statement): TSESTree.CallExpression | undefined {
  const step = stepStatement(statement);
  if (step.type !== AST_NODE_TYPES.ExpressionStatement) {
    return undefined;
  }
  const { expression } = step;
  return releaseCall(
    expression.type === AST_NODE_TYPES.AwaitExpression ? expression.argument : expression,
  );
}

function isReset(expression: TSESTree.Node): boolean {
  if (expression.type === AST_NODE_TYPES.AssignmentExpression) {
    const { right } = expression;
    return (
      (right.type === AST_NODE_TYPES.Identifier && right.name === 'undefined') ||
      RESET_VALUES.has(right.type)
    );
  }
  const call = unwrapExpression(expression);
  return (
    call.type === AST_NODE_TYPES.CallExpression &&
    call.callee.type === AST_NODE_TYPES.MemberExpression &&
    nameOf(call.callee.property) === 'clear'
  );
}

function resetTarget(expression: TSESTree.Node): TSESTree.Node | undefined {
  if (expression.type === AST_NODE_TYPES.AssignmentExpression) {
    return expression.left;
  }
  return expression.type === AST_NODE_TYPES.CallExpression ? expression.callee : undefined;
}

export function laterStep(
  sourceCode: SourceCode,
  original: TSESTree.Statement,
): string | undefined {
  const statement = stepStatement(original);
  if (statement.type !== AST_NODE_TYPES.ExpressionStatement) {
    return undefined;
  }
  const { expression } = statement;
  const target =
    expression.type === AST_NODE_TYPES.AwaitExpression ? expression.argument : expression;
  const call = releaseCall(target);
  if (call !== undefined) {
    return `${sourceCode.getText(call.callee)}()`;
  }
  return isReset(expression) ? sourceCode.getText(resetTarget(expression)) : undefined;
}
