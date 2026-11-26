import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  resolveConstant,
  stringValue,
  type SourceContext,
} from '../analysis/constant-resolution.mts';
import { depthFirst, functionBinding, nameOf, nodeChildren } from '../typed/node-views.mts';
import { enclosingFunction } from '../typed/syntax-views.mts';
import { searchesParents, walksUp } from './walk-up-searches.mts';

const CONFIG_NAME =
  /^(?:tsconfig\.json|jsconfig\.json|\.eslintrc(?:\.[a-z]+)?|eslint\.config\.[cm]?[jt]s|babel\.config\.[cm]?[jt]s|\.babelrc(?:\.[a-z]+)?|\.prettierrc(?:\.[a-z]+)?|prettier\.config\.[cm]?[jt]s|pyproject\.toml|\.editorconfig)$/u;
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

function isDefault(node: TSESTree.Node | null | undefined): boolean {
  if (node === null || node === undefined) {
    return false;
  }
  switch (node.type) {
    case AST_NODE_TYPES.ObjectExpression:
      return node.properties.length > 0;
    case AST_NODE_TYPES.Literal:
      return typeof node.value === 'string' && FILE_LIKE.test(node.value);
    case AST_NODE_TYPES.Identifier:
    case AST_NODE_TYPES.MemberExpression:
      return DEFAULT_NAME.test(lastName(node) ?? '');
    case AST_NODE_TYPES.CallExpression:
      return /^default|Default/u.test(lastName(node.callee) ?? '');
    default:
      return false;
  }
}

function isNothing(node: TSESTree.Node | null | undefined): boolean {
  return (
    node === null ||
    node === undefined ||
    (node.type === AST_NODE_TYPES.Identifier && node.name === 'undefined') ||
    (node.type === AST_NODE_TYPES.Literal && (node.value === null || node.value === false))
  );
}

type Outcome = { readonly value: TSESTree.Node | null | undefined } | undefined;

function branchOutcome(branch: TSESTree.Node | null | undefined): Outcome {
  if (branch === null || branch === undefined) {
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
    return { value: last.argument };
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
    CONFIG_NAME.test(name)
    ? name
    : undefined;
}

function absentOutcome(call: TSESTree.CallExpression): Outcome {
  let node: TSESTree.Node = call;
  let negated = false;
  while (node.parent !== undefined) {
    const parent: TSESTree.Node = node.parent;
    if (
      parent.type === AST_NODE_TYPES.AwaitExpression ||
      parent.type === AST_NODE_TYPES.ChainExpression
    ) {
      node = parent;
    } else if (parent.type === AST_NODE_TYPES.UnaryExpression && parent.operator === '!') {
      negated = !negated;
      node = parent;
    } else {
      break;
    }
  }
  const { parent } = node;
  if (parent?.type === AST_NODE_TYPES.ConditionalExpression && parent.test === node) {
    return branchOutcome(negated ? parent.consequent : parent.alternate);
  }
  if (parent?.type !== AST_NODE_TYPES.IfStatement || parent.test !== node) {
    return undefined;
  }
  if (negated || parent.alternate) {
    return branchOutcome(negated ? parent.consequent : parent.alternate);
  }
  const siblings = parent.parent?.type === AST_NODE_TYPES.BlockStatement ? parent.parent.body : [];
  const next = siblings[siblings.indexOf(parent) + 1];
  const { consequent } = parent;
  const ending =
    consequent.type === AST_NODE_TYPES.BlockStatement ? consequent.body.at(-1) : consequent;
  return ending?.type === AST_NODE_TYPES.ReturnStatement &&
    next?.type === AST_NODE_TYPES.ReturnStatement
    ? branchOutcome(next)
    : undefined;
}

function catchOutcome(call: TSESTree.CallExpression): Outcome {
  for (let node: TSESTree.Node = call; node.parent; node = node.parent) {
    const parent: TSESTree.Node = node.parent;
    if (parent.type === AST_NODE_TYPES.TryStatement && parent.block === node) {
      return branchOutcome(parent.handler?.body);
    }
  }
  return undefined;
}

function callerFallsBackToDefault(program: TSESTree.Node, call: TSESTree.CallExpression): boolean {
  const owner = enclosingFunction(call);
  const name = owner === undefined ? undefined : functionBinding(owner)?.name;
  if (name === undefined) {
    return false;
  }
  return [...depthFirst<TSESTree.Node>(program, nodeChildren)].some((node) => {
    if (node.type !== AST_NODE_TYPES.CallExpression || nameOf(node.callee) !== name) {
      return false;
    }
    let current: TSESTree.Node = node;
    let defaulted = false;
    while (
      current.parent?.type === AST_NODE_TYPES.LogicalExpression &&
      current.parent.operator !== '&&'
    ) {
      defaulted ||= current.parent.left === current && isDefault(current.parent.right);
      current = current.parent;
    }
    return defaulted && !walksUp(current);
  });
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
        if ((!CHECKS.has(name) && !isRead) || target === undefined) {
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
