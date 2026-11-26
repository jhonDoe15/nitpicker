import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, nameOf } from '../typed/node-views.mts';
import { descendants } from '../recursion/graph/file-calls.mts';
import { callsOffList, worklistOf, type Worklist } from './worklist-loops.mts';

type MessageIds = 'depthOnly';

const DEPTH_NAME = /depth|level|hops|distance/iu;
const RELATIONS = new Set(['<', '<=', '>', '>=']);
const MARKS = new Set(['has', 'add', 'set', 'includes']);
const TREE_CHILDREN = /\.(?:children|childNodes)\b|getChildren\(|forEachChild|getChildAt\(/u;
const NESTING = new Set<string>([
  AST_NODE_TYPES.ForOfStatement,
  AST_NODE_TYPES.ForInStatement,
  AST_NODE_TYPES.ForStatement,
  AST_NODE_TYPES.WhileStatement,
  AST_NODE_TYPES.DoWhileStatement,
  AST_NODE_TYPES.ArrowFunctionExpression,
  AST_NODE_TYPES.FunctionExpression,
]);

function loopNames(loop: TSESTree.Node): Set<string> {
  return new Set(
    descendants(loop)
      .flatMap((node) =>
        node.type === AST_NODE_TYPES.VariableDeclarator ? descendants(node.id) : [],
      )
      .flatMap((node) => (node.type === AST_NODE_TYPES.Identifier ? [node.name] : [])),
  );
}

function isDepthSide(node: TSESTree.Node, local: ReadonlySet<string>): boolean {
  if (node.type === AST_NODE_TYPES.MemberExpression) {
    return DEPTH_NAME.test(nameOf(node.property) ?? '');
  }
  const name = nameOf(node);
  return name !== undefined && DEPTH_NAME.test(name) && local.has(name);
}

function checksDepth(worklist: Worklist): boolean {
  const local = loopNames(worklist.loop);
  return descendants(worklist.loop).some(
    (node) =>
      node.type === AST_NODE_TYPES.BinaryExpression &&
      RELATIONS.has(node.operator) &&
      (isDepthSide(node.left, local) || isDepthSide(node.right, local)),
  );
}

function isNested(push: TSESTree.CallExpression, loop: TSESTree.Node): boolean {
  const inside = ancestorsOf(push);
  const end = inside.indexOf(loop);
  return inside.slice(0, end).some((node) => NESTING.has(node.type));
}

function appendsMany({ loop, pushes }: Worklist): boolean {
  return (
    pushes.length > 1 ||
    pushes.some(
      (push) =>
        push.arguments.length > 1 ||
        push.arguments.some((argument) => argument.type === AST_NODE_TYPES.SpreadElement) ||
        isNested(push, loop),
    )
  );
}

function marksItems({ loop, list }: Worklist): boolean {
  const assignsTrue = descendants(loop.body).some(
    (node) =>
      node.type === AST_NODE_TYPES.AssignmentExpression &&
      node.left.type === AST_NODE_TYPES.MemberExpression &&
      node.right.type === AST_NODE_TYPES.Literal &&
      node.right.value === true,
  );
  return assignsTrue || callsOffList(loop.body, MARKS, list).length > 0;
}

function walksTree(worklist: Worklist, sourceCode: Readonly<TSESLint.SourceCode>): boolean {
  return worklist.pushes.some((push) => {
    const inside = ancestorsOf(push);
    const iterables = inside
      .slice(0, inside.indexOf(worklist.loop))
      .flatMap((node) => (node.type === AST_NODE_TYPES.ForOfStatement ? [node.right] : []));
    return [push, ...iterables].some((node) => TREE_CHILDREN.test(sourceCode.getText(node)));
  });
}

export const rule: TSESLint.RuleModule<MessageIds> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow a worklist loop bounded only by a depth limit, with no set of visited items',
    },
    schema: [],
    messages: {
      depthOnly:
        'This worklist is bounded only by a depth limit and remembers nothing it has expanded. A depth limit bounds how long one path is, not how many paths there are: when items share children (a graph, not a tree), each item is expanded once per path that reaches it, so the work grows as the fan-out to the power of the depth and can run out of memory. Keep a Set of the items already expanded and skip an item that is in it.',
    },
  },
  create(context) {
    return {
      'ForOfStatement, WhileStatement'(node: TSESTree.ForOfStatement | TSESTree.WhileStatement) {
        const worklist = worklistOf(node);
        if (
          worklist !== undefined &&
          appendsMany(worklist) &&
          checksDepth(worklist) &&
          !marksItems(worklist) &&
          !walksTree(worklist, context.sourceCode)
        ) {
          context.report({ node, messageId: 'depthOnly' });
        }
      },
    };
  },
};
