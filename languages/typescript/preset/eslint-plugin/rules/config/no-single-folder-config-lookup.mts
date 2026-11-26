import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  resolveConstant,
  stringValue,
  type SourceContext,
} from '../analysis/constant-resolution.mts';
import {
  chainOf,
  depthFirst,
  functionBinding,
  nameOf,
  nodeChildren,
} from '../typed/node-views.mts';
import { enclosingFunction } from '../typed/syntax-views.mts';
import { searchesParents, walksUp } from './walk-up-searches.mts';

const CONFIG_NAMES = [
  /^(?:tsconfig|jsconfig)\.json$/u,
  /^\.(?:eslintrc|babelrc|prettierrc)(?:\.[a-z]+)?$/u,
  /^(?:eslint|babel|prettier)\.config\.[cm]?[jt]s$/u,
  /^(?:pyproject\.toml|\.editorconfig)$/u,
];
const CHECKS = new Set([
  'existsSync',
  'statSync',
  'lstatSync',
  'accessSync',
  'stat',
  'lstat',
  'access',
  'pathExists',
  'pathExistsSync',
]);
const READS = new Set(['readFileSync', 'readFile']);
const JOINS = new Set(['join', 'resolve']);
const ROOT_NAME = /root|repository|repo$/iu;
const FILE_LIKE = /^[\w./-]+\.\w+$/u;
const DEFAULT_NAME = /^[A-Z][A-Z0-9_]*$|^[a-z]\w*Default|^default/u;

function lastName(node: TSESTree.Node): string | undefined {
  return node.type === AST_NODE_TYPES.MemberExpression ? nameOf(node.property) : nameOf(node);
}

function isDefault(node: TSESTree.Node | undefined): boolean {
  if (node === undefined) {
    return false;
  }
  if (node.type === AST_NODE_TYPES.ObjectExpression) {
    return node.properties.length > 0;
  }
  if (node.type === AST_NODE_TYPES.Literal) {
    return typeof node.value === 'string' && FILE_LIKE.test(node.value);
  }
  if (node.type === AST_NODE_TYPES.Identifier || node.type === AST_NODE_TYPES.MemberExpression) {
    return DEFAULT_NAME.test(lastName(node) ?? '');
  }
  return (
    node.type === AST_NODE_TYPES.CallExpression &&
    /^default|Default/u.test(lastName(node.callee) ?? '')
  );
}

function isNothing(node: TSESTree.Node | undefined): boolean {
  return (
    node === undefined ||
    (node.type === AST_NODE_TYPES.Identifier && node.name === 'undefined') ||
    (node.type === AST_NODE_TYPES.Literal && (node.value === null || node.value === false))
  );
}

type Outcome = { readonly value: TSESTree.Node | undefined } | undefined;

function branchOutcome(branch: TSESTree.Node | undefined): Outcome {
  if (branch === undefined) {
    return undefined;
  }
  if (
    branch.type !== AST_NODE_TYPES.BlockStatement &&
    branch.type !== AST_NODE_TYPES.ReturnStatement &&
    branch.type !== AST_NODE_TYPES.ExpressionStatement
  ) {
    return { value: branch };
  }
  const last = branch.type === AST_NODE_TYPES.BlockStatement ? branch.body.at(-1) : branch;
  if (last?.type === AST_NODE_TYPES.ReturnStatement) {
    return { value: last.argument ?? undefined };
  }
  return last?.type === AST_NODE_TYPES.ExpressionStatement &&
    last.expression.type === AST_NODE_TYPES.AssignmentExpression
    ? { value: last.expression.right }
    : undefined;
}

function joinedName(context: SourceContext, argument: TSESTree.Node): string | undefined {
  const joined = resolveConstant(context, argument);
  if (
    joined?.type !== AST_NODE_TYPES.CallExpression ||
    !JOINS.has(lastName(joined.callee) ?? '') ||
    joined.arguments.length !== 2
  ) {
    return undefined;
  }
  const [directory, file] = joined.arguments;
  const name = stringValue(resolveConstant(context, file));
  return directory !== undefined &&
    !ROOT_NAME.test(lastName(directory) ?? '') &&
    name !== undefined &&
    CONFIG_NAMES.some((pattern) => pattern.test(name))
    ? name
    : undefined;
}

function isTransparentParent(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.AwaitExpression ||
    node.type === AST_NODE_TYPES.ChainExpression ||
    (node.type === AST_NODE_TYPES.UnaryExpression && node.operator === '!')
  );
}

function absentTarget(call: TSESTree.CallExpression): {
  readonly node: TSESTree.Node;
  readonly negated: boolean;
} {
  const chain = chainOf<TSESTree.Node>(call, (current) =>
    current.parent !== undefined && isTransparentParent(current.parent)
      ? current.parent
      : undefined,
  );
  const negations = chain.filter((link) => link.type === AST_NODE_TYPES.UnaryExpression).length;
  return { node: chain.at(-1) ?? call, negated: negations % 2 === 1 };
}

function followingReturn(statement: TSESTree.IfStatement): Outcome {
  const siblings =
    statement.parent.type === AST_NODE_TYPES.BlockStatement ? statement.parent.body : [];
  const next = siblings[siblings.indexOf(statement) + 1];
  const { consequent } = statement;
  const ending =
    consequent.type === AST_NODE_TYPES.BlockStatement ? consequent.body.at(-1) : consequent;
  return ending?.type === AST_NODE_TYPES.ReturnStatement &&
    next?.type === AST_NODE_TYPES.ReturnStatement
    ? branchOutcome(next)
    : undefined;
}

function absentOutcome(call: TSESTree.CallExpression): Outcome {
  const { node, negated } = absentTarget(call);
  const { parent } = node;
  if (parent?.type === AST_NODE_TYPES.ConditionalExpression && parent.test === node) {
    return branchOutcome(negated ? parent.consequent : parent.alternate);
  }
  if (parent?.type !== AST_NODE_TYPES.IfStatement || parent.test !== node) {
    return undefined;
  }
  if (negated || parent.alternate) {
    return branchOutcome(negated ? parent.consequent : (parent.alternate ?? undefined));
  }
  return followingReturn(parent);
}

function catchOutcome(call: TSESTree.CallExpression): Outcome {
  const guarded = chainOf<TSESTree.Node>(call, (current) => current.parent).find(
    (node) => node.parent?.type === AST_NODE_TYPES.TryStatement && node.parent.block === node,
  );
  const parent = guarded?.parent;
  return parent?.type === AST_NODE_TYPES.TryStatement
    ? branchOutcome(parent.handler?.body)
    : undefined;
}

function defaultingParent(node: TSESTree.Node): TSESTree.LogicalExpression | undefined {
  const { parent } = node;
  return parent?.type === AST_NODE_TYPES.LogicalExpression && parent.operator !== '&&'
    ? parent
    : undefined;
}

function isDefaultedCall(call: TSESTree.CallExpression): boolean {
  const chain = chainOf<TSESTree.Node>(call, defaultingParent);
  const defaulted = chain.some((current) => {
    const parent = defaultingParent(current);
    return parent !== undefined && parent.left === current && isDefault(parent.right);
  });
  const end = chain.at(-1);
  return defaulted && end !== undefined && !walksUp(end);
}

function callerFallsBackToDefault(program: TSESTree.Node, call: TSESTree.CallExpression): boolean {
  const owner = enclosingFunction(call);
  const name = owner === undefined ? undefined : functionBinding(owner)?.name;
  if (name === undefined) {
    return false;
  }
  return [...depthFirst<TSESTree.Node>(program, nodeChildren)].some(
    (node) =>
      node.type === AST_NODE_TYPES.CallExpression &&
      nameOf(node.callee) === name &&
      isDefaultedCall(node),
  );
}

export const rule: TSESLint.RuleModule<'singleFolder'> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow looking for a tool config file in one folder and falling back to a default',
    },
    schema: [],
    messages: {
      singleFolder:
        'This looks for a config file the tool itself searches the parent folders for, in one folder only, and falls back to a default. A package covered by a config higher up (a workspace root) gets the default here. Look in the parent folders, up to the repository root, before falling back to the default.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const name = lastName(node.callee) ?? '';
        const [target] = node.arguments;
        const isRead = READS.has(name);
        if (!(CHECKS.has(name) || isRead) || target === undefined) {
          return;
        }
        const config = joinedName(context, target);
        const outcome = absentOutcome(node) ?? (isRead ? catchOutcome(node) : undefined);
        if (config === undefined || outcome === undefined) {
          return;
        }
        const { ast } = context.sourceCode;
        const defaults =
          isDefault(outcome.value) ||
          (isNothing(outcome.value) && callerFallsBackToDefault(ast, node));
        if (defaults && !searchesParents(ast, node)) {
          context.report({ node, messageId: 'singleFolder' });
        }
      },
    };
  },
};
