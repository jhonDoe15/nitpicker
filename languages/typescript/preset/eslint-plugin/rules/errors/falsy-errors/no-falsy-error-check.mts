import {
  AST_NODE_TYPES,
  type ParserServicesWithTypeInformation,
  type TSESLint,
  type TSESTree,
} from '@typescript-eslint/utils';
import { typedServices } from '../../decided/facts.mts';
import { syntaxChildren } from '../../decided/syntax.mts';
import { depthFirst } from '../../typed/node-views.mts';
import { hasNullGuard } from './null-guards.mts';
import { isCaughtValue, isUntypedErrorProperty } from './error-sources.mts';

type MessageId = 'truthiness' | 'typeofObject';

function withoutNegation(node: TSESTree.Node): TSESTree.Node {
  if (node.type === AST_NODE_TYPES.ChainExpression) {
    return node.expression;
  }
  return node.type === AST_NODE_TYPES.UnaryExpression && node.operator === '!'
    ? withoutNegation(node.argument)
    : node;
}

type Checker = {
  readonly code: TSESLint.SourceCode;
  readonly services: ParserServicesWithTypeInformation | undefined;
  readonly report: (node: TSESTree.Node, messageId: MessageId, name: string) => void;
};

function isSource(checker: Checker, node: TSESTree.Node): boolean {
  return node.type === AST_NODE_TYPES.Identifier
    ? isCaughtValue(checker.code, node)
    : isUntypedErrorProperty(checker.services, node);
}

function checkTest(
  checker: Checker,
  test: TSESTree.Node,
  branches: readonly (TSESTree.Node | null)[],
): void {
  const target = withoutNegation(test);
  const text = checker.code.getText(target).replaceAll('?.', '.');
  if (isSource(checker, target) && !dereferences(branches, text, checker.code)) {
    checker.report(target, 'truthiness', checker.code.getText(target));
  }
}

function checkFallback(checker: Checker, node: TSESTree.LogicalExpression): void {
  const fallback =
    node.operator === '||' &&
    (node.right.type === AST_NODE_TYPES.MemberExpression ||
      node.right.type === AST_NODE_TYPES.Identifier);
  if (fallback && isUntypedErrorProperty(checker.services, node.left)) {
    checker.report(node.left, 'truthiness', checker.code.getText(node.left));
  }
}

function checkCoercion(checker: Checker, node: TSESTree.UnaryExpression): void {
  const inner = node.argument;
  const coerces = inner.type === AST_NODE_TYPES.UnaryExpression && inner.operator === '!';
  const parent = node.parent;
  const testPosition =
    (parent.type === AST_NODE_TYPES.UnaryExpression && parent.operator === '!') ||
    ((parent.type === AST_NODE_TYPES.IfStatement ||
      parent.type === AST_NODE_TYPES.WhileStatement ||
      parent.type === AST_NODE_TYPES.ConditionalExpression) &&
      parent.test === node);
  if (coerces && !testPosition) {
    const target = withoutNegation(inner);
    if (isSource(checker, target)) {
      checker.report(target, 'truthiness', checker.code.getText(target));
    }
  }
}

function checkTypeof(checker: Checker, node: TSESTree.UnaryExpression): void {
  const comparison = node.parent;
  if (
    comparison.type !== AST_NODE_TYPES.BinaryExpression ||
    !['===', '!==', '==', '!='].includes(comparison.operator)
  ) {
    return;
  }
  const other = comparison.left === node ? comparison.right : comparison.left;
  if (
    other.type === AST_NODE_TYPES.Literal &&
    other.value === 'object' &&
    isSource(checker, node.argument) &&
    !hasNullGuard(checker.code, node, node.argument)
  ) {
    checker.report(node, 'typeofObject', checker.code.getText(node.argument));
  }
}

function dereferences(
  branches: readonly (TSESTree.Node | null)[],
  text: string,
  code: TSESLint.SourceCode,
): boolean {
  return branches.some(
    (branch) =>
      branch !== null &&
      [...depthFirst<TSESTree.Node>(branch, syntaxChildren)].some(
        (node) =>
          node.type === AST_NODE_TYPES.MemberExpression &&
          code.getText(node.object).replaceAll('?.', '.') === text,
      ),
  );
}

const LOGGERS = new Set<string>(['console', 'logger']);

function onlyLogs(branch: TSESTree.Node | null): boolean {
  const statements = branch?.type === AST_NODE_TYPES.BlockStatement ? branch.body : [branch];
  return (
    statements.length > 0 &&
    statements.every((statement) => {
      let current: TSESTree.Node | undefined =
        statement?.type === AST_NODE_TYPES.ExpressionStatement &&
        statement.expression.type === AST_NODE_TYPES.CallExpression
          ? statement.expression.callee
          : undefined;
      while (current?.type === AST_NODE_TYPES.MemberExpression) {
        current = current.object;
      }
      return current?.type === AST_NODE_TYPES.Identifier && LOGGERS.has(current.name);
    })
  );
}

export const rule: TSESLint.RuleModule<
  MessageId,
  readonly [],
  { readonly requiresTypeChecking: boolean }
> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Report a caught error, rejection reason or error property tested by truthiness, or by typeof object without a null check',
      requiresTypeChecking: false,
    },
    schema: [],
    messages: {
      truthiness:
        "`{{name}}` is a thrown or rejected value, and code can throw `undefined`, `null`, `0` or `''`, so testing it by truthiness treats that failure as no error. Track presence separately (a flag), test `!== undefined` when undefined means no error by contract, or use `'cause' in error`. An exception fits only when a falsy value must count as no error.",
      typeofObject:
        "`typeof {{name}} === 'object'` is also true for `null`, so a thrown `null` passes as an object. Add `{{name}} !== null` to the test.",
    },
  },
  create(context) {
    const code = context.sourceCode;
    const services = typedServices(code.parserServices) ? code.parserServices : undefined;
    const checker: Checker = {
      code,
      services,
      report: (node, messageId, name) => context.report({ node, messageId, data: { name } }),
    };

    return {
      IfStatement(node) {
        if (node.alternate === null && onlyLogs(node.consequent)) {
          return;
        }
        checkTest(checker, node.test, [node.consequent, node.alternate]);
      },
      WhileStatement: (node) => checkTest(checker, node.test, [node.body]),
      ConditionalExpression: (node) =>
        checkTest(checker, node.test, [node.consequent, node.alternate]),
      LogicalExpression: (node) => checkFallback(checker, node),
      "UnaryExpression[operator='!']": (node: TSESTree.UnaryExpression) =>
        checkCoercion(checker, node),
      "UnaryExpression[operator='typeof']": (node: TSESTree.UnaryExpression) =>
        checkTypeof(checker, node),
    };
  },
};
