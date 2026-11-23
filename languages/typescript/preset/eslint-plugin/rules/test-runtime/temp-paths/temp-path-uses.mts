import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, type SourceContext } from '../../analysis/constant-resolution.mts';
import { ancestorsOf } from '../../analysis/ancestry.mts';
import { functionBinding, type FunctionNode } from '../../typed/node-views.mts';
import { calleeName } from '../../typed/syntax-views.mts';
import { isJoin } from '../../unique-names/time-values.mts';

const MAX_DEPTH = 6;
const MOVE_NAMES = ['rename'];
const TARGET_NAMES = ['copyFile', 'cp', 'copy', 'symlink'];
const ONE_PATH_NAMES = [
  'writeFile',
  'appendFile',
  'createWriteStream',
  'mkdir',
  'outputFile',
  'outputJson',
  'writeJson',
  'ensureDir',
  'emptyDir',
  'rm',
  'rmdir',
  'unlink',
  'remove',
  'truncate',
];
function withSync(names: readonly string[]): string[] {
  return names.flatMap((name) => [name, `${name}Sync`]);
}

const MOVES = new Set(withSync(MOVE_NAMES));
const TARGETS = new Set(withSync(TARGET_NAMES));
const FILE_CHANGES = new Set(withSync([...ONE_PATH_NAMES, ...MOVE_NAMES, ...TARGET_NAMES]));
const PROCESS_STARTS = new Set([
  'exec',
  'execSync',
  'execFile',
  'execFileSync',
  'spawn',
  'spawnSync',
  'fork',
  'execa',
  'execaSync',
  'execaNode',
]);
const CARRIERS = new Set<string>([
  AST_NODE_TYPES.ArrayExpression,
  AST_NODE_TYPES.SpreadElement,
  AST_NODE_TYPES.ObjectExpression,
  AST_NODE_TYPES.AwaitExpression,
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.TSNonNullExpression,
  AST_NODE_TYPES.TSSatisfiesExpression,
]);

export function isPathPiece(node: TSESTree.Node | undefined): boolean {
  return (
    node?.type === AST_NODE_TYPES.TemplateLiteral ||
    (node?.type === AST_NODE_TYPES.BinaryExpression && node.operator === '+') ||
    (node !== undefined && isJoin(node))
  );
}

const DATA_CARRIERS = new Set<string>([
  AST_NODE_TYPES.ArrayExpression,
  AST_NODE_TYPES.SpreadElement,
  AST_NODE_TYPES.ObjectExpression,
  AST_NODE_TYPES.Property,
]);

type Carried = { readonly top: TSESTree.Node; readonly asData: boolean };

function isCarried(node: TSESTree.Node): boolean {
  const { parent } = node;
  if (parent === undefined) {
    return false;
  }
  if (parent.type === AST_NODE_TYPES.Property) {
    return parent.value === node && parent.parent.type === AST_NODE_TYPES.ObjectExpression;
  }
  return CARRIERS.has(parent.type) || isPathPiece(parent);
}

function carrierOf(node: TSESTree.Node): Carried {
  const chain = [node];
  for (const current of chain) {
    if (current.parent && isCarried(current)) {
      chain.push(current.parent);
    }
  }
  const asData = chain.slice(1).some((carrier) => DATA_CARRIERS.has(carrier.type));
  return { top: chain.at(-1) ?? node, asData };
}

function enclosingFunction(node: TSESTree.Node): FunctionNode | undefined {
  const { parent } = node;
  if (parent?.type === AST_NODE_TYPES.ArrowFunctionExpression && parent.body === node) {
    return parent;
  }
  if (parent?.type !== AST_NODE_TYPES.ReturnStatement) {
    return undefined;
  }
  return ancestorsOf(parent).find((ancestor) => isFunction(ancestor));
}

function isFunction(node: TSESTree.Node): node is FunctionNode {
  return (
    node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionDeclaration
  );
}

function readsOf(context: SourceContext, binding: TSESTree.Identifier): TSESTree.Node[] {
  const variable = findVariable(context, binding, binding.name);
  return (variable?.references ?? []).filter((use) => use.isRead()).map((use) => use.identifier);
}

function usesOf(context: SourceContext, node: TSESTree.Node): TSESTree.Node[] {
  const { parent } = node;
  if (
    parent?.type === AST_NODE_TYPES.VariableDeclarator &&
    parent.init === node &&
    parent.id.type === AST_NODE_TYPES.Identifier
  ) {
    return readsOf(context, parent.id);
  }
  const fn = enclosingFunction(node);
  const binding = fn ? functionBinding(fn) : undefined;
  if (binding) {
    return readsOf(context, binding).flatMap((use) =>
      use.parent?.type === AST_NODE_TYPES.CallExpression && use.parent.callee === use
        ? [use.parent]
        : [],
    );
  }
  return [node];
}

function isChangeCall({ top, asData }: Carried): boolean {
  const { parent } = top;
  if (
    (parent?.type !== AST_NODE_TYPES.CallExpression &&
      parent?.type !== AST_NODE_TYPES.NewExpression) ||
    parent.callee === top
  ) {
    return false;
  }
  const name = calleeName(parent.callee);
  const position = parent.arguments.findIndex((argument) => argument === top);
  if (position < 0) {
    return false;
  }
  const isPathArgument = TARGETS.has(name)
    ? position === 1
    : position === 0 || (position === 1 && MOVES.has(name));
  return PROCESS_STARTS.has(name) || (FILE_CHANGES.has(name) && !asData && isPathArgument);
}

export function reachesFileChange(context: SourceContext, start: TSESTree.Node): boolean {
  const pending = [{ node: start, depth: 0 }];
  for (const { node, depth } of pending) {
    const carried = depth > MAX_DEPTH ? [] : usesOf(context, node).map((use) => carrierOf(use));
    if (carried.some((carrier) => isChangeCall(carrier))) {
      return true;
    }
    const next = carried.filter(({ top }) => top !== node);
    pending.push(...next.map(({ top }) => ({ node: top, depth: depth + 1 })));
  }
  return false;
}
