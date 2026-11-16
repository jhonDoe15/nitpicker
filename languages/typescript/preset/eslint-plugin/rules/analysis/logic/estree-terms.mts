import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { foldTree, isNode, type SourceCode } from '../../typed/node-views.mts';
import { term, withRange, type Term } from './term-views.mts';

export type { Term } from './term-views.mts';

export type TermOptions = {
  readonly isBoolean?: (node: TSESTree.Node) => boolean;
  readonly isInteger?: (node: TSESTree.Node) => boolean;
};

type Transparent =
  | TSESTree.TSAsExpression
  | TSESTree.TSNonNullExpression
  | TSESTree.TSSatisfiesExpression
  | TSESTree.TSTypeAssertion
  | TSESTree.TSInstantiationExpression;

type Composite =
  | TSESTree.UnaryExpression
  | TSESTree.BinaryExpression
  | TSESTree.LogicalExpression
  | TSESTree.ConditionalExpression
  | TSESTree.MemberExpression
  | TSESTree.CallExpression
  | TSESTree.BlockStatement
  | TSESTree.IfStatement
  | TSESTree.ReturnStatement
  | TSESTree.ThrowStatement
  | TSESTree.ExpressionStatement;

type Operator = TSESTree.UnaryExpression | TSESTree.BinaryExpression | TSESTree.LogicalExpression;
type Made = { readonly sourceCode: Pick<SourceCode, 'getText'> } & Required<TermOptions>;

const OPAQUE = 'opaque';
const LOOSE = new Set<string>([
  AST_NODE_TYPES.SequenceExpression,
  AST_NODE_TYPES.AssignmentExpression,
  AST_NODE_TYPES.YieldExpression,
]);

const OPERATORS = {
  [AST_NODE_TYPES.UnaryExpression]: 'unary',
  [AST_NODE_TYPES.BinaryExpression]: 'binary',
  [AST_NODE_TYPES.LogicalExpression]: 'logical',
} as const;

const COMPOSITES = new Set<string>([
  AST_NODE_TYPES.UnaryExpression,
  AST_NODE_TYPES.BinaryExpression,
  AST_NODE_TYPES.LogicalExpression,
  AST_NODE_TYPES.ConditionalExpression,
  AST_NODE_TYPES.MemberExpression,
  AST_NODE_TYPES.CallExpression,
  AST_NODE_TYPES.BlockStatement,
  AST_NODE_TYPES.IfStatement,
  AST_NODE_TYPES.ReturnStatement,
  AST_NODE_TYPES.ThrowStatement,
  AST_NODE_TYPES.ExpressionStatement,
]);

function isTransparent(node: TSESTree.Node): node is Transparent {
  return (
    node.type === AST_NODE_TYPES.TSAsExpression ||
    node.type === AST_NODE_TYPES.TSNonNullExpression ||
    node.type === AST_NODE_TYPES.TSSatisfiesExpression ||
    node.type === AST_NODE_TYPES.TSTypeAssertion ||
    node.type === AST_NODE_TYPES.TSInstantiationExpression
  );
}

function isCompositeType(node: TSESTree.Node): node is Composite {
  return COMPOSITES.has(node.type);
}

function isModeledMember(node: TSESTree.MemberExpression): boolean {
  return !node.optional && node.object.type !== AST_NODE_TYPES.Super;
}

function isModeled(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.UnaryExpression) {
    return node.operator !== 'delete';
  }
  if (node.type === AST_NODE_TYPES.BinaryExpression) {
    return node.left.type !== AST_NODE_TYPES.PrivateIdentifier;
  }
  if (node.type === AST_NODE_TYPES.MemberExpression) {
    return isModeledMember(node);
  }
  if (node.type === AST_NODE_TYPES.CallExpression) {
    return !node.optional && node.callee.type !== AST_NODE_TYPES.Super;
  }
  if (node.type === AST_NODE_TYPES.TemplateLiteral) {
    return node.expressions.length === 0;
  }
  if (node.type === AST_NODE_TYPES.Literal) {
    return !('regex' in node);
  }
  return true;
}

function compositeOf(node: TSESTree.Node): Composite | undefined {
  return isCompositeType(node) && isModeled(node) ? node : undefined;
}

export function isTermPart(node: TSESTree.Node): boolean {
  return isTransparent(node) || compositeOf(node) !== undefined;
}

function fieldsOf(node: Composite): readonly unknown[] {
  switch (node.type) {
    case AST_NODE_TYPES.UnaryExpression:
    case AST_NODE_TYPES.ReturnStatement:
    case AST_NODE_TYPES.ThrowStatement: {
      return [node.argument];
    }
    case AST_NODE_TYPES.BinaryExpression:
    case AST_NODE_TYPES.LogicalExpression: {
      return [node.left, node.right];
    }
    case AST_NODE_TYPES.ConditionalExpression:
    case AST_NODE_TYPES.IfStatement: {
      return [node.test, node.consequent, node.alternate];
    }
    case AST_NODE_TYPES.MemberExpression: {
      return node.computed ? [node.object, node.property] : [node.object];
    }
    case AST_NODE_TYPES.CallExpression: {
      return [node.callee, ...node.arguments];
    }
    case AST_NODE_TYPES.BlockStatement: {
      return node.body;
    }
    case AST_NODE_TYPES.ExpressionStatement: {
      return [node.expression];
    }
  }
}

function parts(node: TSESTree.Node): TSESTree.Node[] {
  if (isTransparent(node)) {
    return [node.expression];
  }
  const composite = compositeOf(node);
  return composite === undefined ? [] : fieldsOf(composite).filter(isNode);
}

function literalValue(node: TSESTree.Literal): string {
  if (typeof node.value === 'string') {
    return JSON.stringify(node.value);
  }
  if (typeof node.value === 'number') {
    return String(node.value);
  }
  if ('bigint' in node && typeof node.bigint === 'string') {
    return `${BigInt(node.bigint).toString()}n`;
  }
  const isNull = node.value === null && !('regex' in node) && !('bigint' in node);
  return isNull ? 'null' : node.raw;
}

function asBlock(statement: Term): Term {
  return statement.kind === 'block'
    ? statement
    : withRange(term('block', undefined, [statement]), statement.range);
}

function leaf(node: TSESTree.Node, sourceCode: Pick<SourceCode, 'getText'>): Term {
  if (!isModeled(node)) {
    return opaque(node, sourceCode.getText(node));
  }
  if (node.type === AST_NODE_TYPES.Literal) {
    return term('literal', literalValue(node));
  }
  if (node.type === AST_NODE_TYPES.TemplateLiteral) {
    return term('literal', JSON.stringify(node.quasis.map((quasi) => quasi.value.cooked).join('')));
  }
  if (node.type === AST_NODE_TYPES.Identifier) {
    return term('name', node.name);
  }
  if (node.type === AST_NODE_TYPES.ThisExpression) {
    return term('this');
  }
  if (node.type === AST_NODE_TYPES.BreakStatement) {
    return term('break', node.label?.name);
  }
  if (node.type === AST_NODE_TYPES.ContinueStatement) {
    return term('continue', node.label?.name);
  }
  return opaque(node, sourceCode.getText(node));
}

function opaque(node: TSESTree.Node, text: string): Term {
  if (node.type.endsWith('Declaration')) {
    return term('declaration', text);
  }
  if (node.type.endsWith('Statement')) {
    return term('statement', text);
  }
  if (node.type === AST_NODE_TYPES.ArrowFunctionExpression) {
    return { ...term(OPAQUE, text), loose: true, assignment: true };
  }
  return LOOSE.has(node.type) ? { ...term(OPAQUE, text), loose: true } : term(OPAQUE, text);
}

function isOperator(node: Composite): node is Operator {
  return (
    node.type === AST_NODE_TYPES.UnaryExpression ||
    node.type === AST_NODE_TYPES.BinaryExpression ||
    node.type === AST_NODE_TYPES.LogicalExpression
  );
}

function composite(node: Composite, children: Term[]): Term {
  if (isOperator(node)) {
    return term(OPERATORS[node.type], node.operator, children);
  }
  switch (node.type) {
    case AST_NODE_TYPES.ReturnStatement: {
      return term('return', undefined, children);
    }
    case AST_NODE_TYPES.ThrowStatement: {
      return term('throw', undefined, children);
    }
    case AST_NODE_TYPES.ExpressionStatement: {
      return term('expression', undefined, children);
    }
    case AST_NODE_TYPES.ConditionalExpression: {
      return term('conditional', undefined, children);
    }
    case AST_NODE_TYPES.MemberExpression: {
      if (node.computed) {
        return term('index', undefined, children);
      }
      const name =
        node.property.type === AST_NODE_TYPES.PrivateIdentifier
          ? `#${node.property.name}`
          : node.property.name;
      return term('member', name, children);
    }
    case AST_NODE_TYPES.CallExpression: {
      return term('call', undefined, children);
    }
    case AST_NODE_TYPES.IfStatement: {
      return term(
        'if',
        undefined,
        children.map((child, index) => (index === 0 ? child : asBlock(child))),
      );
    }
    case AST_NODE_TYPES.BlockStatement: {
      return term('block', undefined, children);
    }
  }
}

function never(): boolean {
  return false;
}

function made(node: TSESTree.Node, children: Term[], options: Made): Term {
  const { sourceCode, isBoolean, isInteger } = options;
  if (isTransparent(node)) {
    return children[0] ?? opaque(node, sourceCode.getText(node));
  }
  const modeled = compositeOf(node);
  const shape = modeled === undefined ? leaf(node, sourceCode) : composite(modeled, children);
  const placed = withRange(shape, node.range);
  return {
    ...placed,
    ...(isBoolean(node) ? { boolean: true } : {}),
    ...(isInteger(node) ? { integer: true } : {}),
  };
}

export function toTerm(
  root: TSESTree.Node,
  sourceCode: Pick<SourceCode, 'getText'>,
  { isBoolean = never, isInteger = never }: TermOptions = {},
): Term {
  const options = { sourceCode, isBoolean, isInteger };
  return foldTree<TSESTree.Node, undefined, Term>(root, undefined, {
    expand: (node) => parts(node).map((child) => [child, undefined]),
    combine: (node, _context, children) => made(node, children, options),
  });
}
