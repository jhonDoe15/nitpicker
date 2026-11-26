import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  resolveConstant,
  stringValue,
  type SourceContext,
} from '../analysis/constant-resolution.mts';
import { nameOf } from '../typed/node-views.mts';
import { searchesParents } from './walk-up-searches.mts';

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
    case AST_NODE_TYPES.ArrayExpression:
    case AST_NODE_TYPES.TemplateLiteral:
      return true;
    case AST_NODE_TYPES.Literal:
      return typeof node.value === 'string';
    case AST_NODE_TYPES.Identifier:
    case AST_NODE_TYPES.MemberExpression:
      return DEFAULT_NAME.test(lastName(node) ?? '');
    case AST_NODE_TYPES.CallExpression:
      return /^default|Default/u.test(lastName(node.callee) ?? '');
    default:
      return false;
  }
}

function yieldsDefault(branch: TSESTree.Node | null | undefined): boolean {
  if (branch === null || branch === undefined) {
    return false;
  }
  const last = branch.type === AST_NODE_TYPES.BlockStatement ? branch.body.at(-1) : branch;
  if (last?.type === AST_NODE_TYPES.ReturnStatement) {
    return isDefault(last.argument);
  }
  return (
    last?.type === AST_NODE_TYPES.ExpressionStatement &&
    last.expression.type === AST_NODE_TYPES.AssignmentExpression &&
    isDefault(last.expression.right)
  );
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

function absentBranchDefaults(call: TSESTree.CallExpression): boolean {
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
    return isDefault(negated ? parent.consequent : parent.alternate);
  }
  if (parent?.type === AST_NODE_TYPES.IfStatement && parent.test === node) {
    return yieldsDefault(negated ? parent.consequent : parent.alternate);
  }
  return false;
}

function catchDefaults(call: TSESTree.CallExpression): boolean {
  for (let node: TSESTree.Node = call; node.parent; node = node.parent) {
    const parent: TSESTree.Node = node.parent;
    if (parent.type === AST_NODE_TYPES.TryStatement && parent.block === node) {
      return yieldsDefault(parent.handler?.body);
    }
  }
  return false;
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
        const defaults = absentBranchDefaults(node) || (isRead && catchDefaults(node));
        if (config !== undefined && defaults && !searchesParents(context.sourceCode.ast, node)) {
          context.report({ node, messageId: 'singleFolder' });
        }
      },
    };
  },
};
