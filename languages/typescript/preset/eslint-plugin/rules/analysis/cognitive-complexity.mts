import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';

type FunctionNode =
  TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression;
type Options = readonly [number?];
type Context = Readonly<TSESLint.RuleContext<'tooComplex', Options>>;
type Position = { readonly root: FunctionNode | undefined; readonly nesting: number };
type Report = {
  readonly context: Context;
  readonly max: number;
  readonly scores: ReadonlyMap<FunctionNode, number>;
};

const functionTypes = new Set<string>([
  AST_NODE_TYPES.FunctionDeclaration,
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.ArrowFunctionExpression,
]);
const loopTypes = new Set<string>([
  AST_NODE_TYPES.ForStatement,
  AST_NODE_TYPES.ForInStatement,
  AST_NODE_TYPES.ForOfStatement,
  AST_NODE_TYPES.WhileStatement,
  AST_NODE_TYPES.DoWhileStatement,
]);
const nestedStructureTypes = new Set<string>([
  ...loopTypes,
  AST_NODE_TYPES.ConditionalExpression,
  AST_NODE_TYPES.SwitchStatement,
  AST_NODE_TYPES.CatchClause,
]);
const sequenceOperators = new Set(['&&', '||']);
const outsideFunctions: Position = { root: undefined, nesting: 0 };
const DEFAULT_MAX = 15;

type LoopNode =
  | TSESTree.ForStatement
  | TSESTree.ForInStatement
  | TSESTree.ForOfStatement
  | TSESTree.WhileStatement
  | TSESTree.DoWhileStatement;

function isLoop(node: TSESTree.Node): node is LoopNode {
  return loopTypes.has(node.type);
}

function isFunction(node: TSESTree.Node): node is FunctionNode {
  return functionTypes.has(node.type);
}

function isElseIf(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.IfStatement &&
    node.parent.type === AST_NODE_TYPES.IfStatement &&
    node.parent.alternate === node
  );
}

function nestsChild(parent: TSESTree.Node, child: TSESTree.Node): boolean {
  if (parent.type === AST_NODE_TYPES.IfStatement) {
    return (
      parent.consequent === child ||
      (parent.alternate === child && child.type !== AST_NODE_TYPES.IfStatement)
    );
  }
  if (parent.type === AST_NODE_TYPES.ConditionalExpression) {
    return parent.test !== child;
  }
  if (parent.type === AST_NODE_TYPES.SwitchStatement) {
    return parent.discriminant !== child;
  }
  if (parent.type === AST_NODE_TYPES.CatchClause) {
    return parent.body === child;
  }
  return isLoop(parent) && parent.body === child;
}

function startsLogicalSequence(node: TSESTree.LogicalExpression): boolean {
  return (
    sequenceOperators.has(node.operator) &&
    (node.parent.type !== AST_NODE_TYPES.LogicalExpression ||
      node.parent.operator !== node.operator)
  );
}

function headLocation(
  sourceCode: Context['sourceCode'],
  fn: FunctionNode,
): TSESTree.SourceLocation {
  if (fn.id) {
    return fn.id.loc;
  }
  const parent = fn.parent;
  if (
    parent.type === AST_NODE_TYPES.MethodDefinition ||
    parent.type === AST_NODE_TYPES.Property ||
    parent.type === AST_NODE_TYPES.PropertyDefinition
  ) {
    return parent.key.loc;
  }
  if (fn.type === AST_NODE_TYPES.ArrowFunctionExpression) {
    return (sourceCode.getTokenBefore(fn.body, (token) => token.value === '=>') ?? fn).loc;
  }
  return (sourceCode.getFirstToken(fn) ?? fn).loc;
}

function reportFunction({ context, max, scores }: Report, fn: FunctionNode): void {
  const value = scores.get(fn) ?? 0;
  if (value <= max) {
    return;
  }
  context.report({
    loc: headLocation(context.sourceCode, fn),
    messageId: 'tooComplex',
    data: { value: String(value), max: String(max) },
  });
}

export const rule: TSESLint.RuleModule<'tooComplex', Options> = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Limit how hard a function is to read: branches, loops and boolean chains cost more the deeper they nest',
    },
    schema: [{ type: 'integer', minimum: 0 }],
    messages: {
      tooComplex:
        'This function has a cognitive complexity of {{value}}; the limit is {{max}}. Move nested branches and conditions into smaller named functions.',
    },
  },
  create(context) {
    const max = context.options[0] ?? DEFAULT_MAX;
    const positions = new Map<TSESTree.Node, Position>();
    const scores = new Map<FunctionNode, number>();

    function positionOf(node: TSESTree.Node): Position {
      if (isFunction(node)) {
        return { root: node, nesting: 0 };
      }
      const owner = node.parent;
      const parent = owner ? positions.get(owner) : undefined;
      if (owner === undefined || parent === undefined) {
        return outsideFunctions;
      }
      const nests = nestsChild(owner, node) ? 1 : 0;
      return { root: parent.root, nesting: parent.nesting + nests };
    }

    function add(node: TSESTree.Node, { nested }: { readonly nested: boolean }): void {
      const { root, nesting } = positionOf(node);
      if (root === undefined) {
        return;
      }
      scores.set(root, (scores.get(root) ?? 0) + (nested ? 1 + nesting : 1));
    }

    return {
      '*'(node: TSESTree.Node) {
        positions.set(node, positionOf(node));
      },
      IfStatement(node: TSESTree.IfStatement) {
        add(node, { nested: !isElseIf(node) });
        if (node.alternate && node.alternate.type !== AST_NODE_TYPES.IfStatement) {
          add(node.alternate, { nested: false });
        }
      },
      [[...nestedStructureTypes].join(',')](node: TSESTree.Node) {
        add(node, { nested: true });
      },
      'BreakStatement[label], ContinueStatement[label]'(
        node: TSESTree.BreakStatement | TSESTree.ContinueStatement,
      ) {
        add(node, { nested: false });
      },
      LogicalExpression(node: TSESTree.LogicalExpression) {
        if (startsLogicalSequence(node)) {
          add(node, { nested: false });
        }
      },
      ':function:exit'(fn: FunctionNode) {
        reportFunction({ context, max, scores }, fn);
      },
    };
  },
};
