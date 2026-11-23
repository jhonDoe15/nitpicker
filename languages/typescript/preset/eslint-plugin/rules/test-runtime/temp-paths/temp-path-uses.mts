import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, type SourceContext } from '../../analysis/constant-resolution.mts';
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
const withSync = (names: readonly string[]) => names.flatMap((name) => [name, `${name}Sync`]);
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

type FunctionNode =
  TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration;

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
  let top = node;
  let asData = false;
  while (isCarried(top) && top.parent) {
    asData ||= DATA_CARRIERS.has(top.parent.type);
    top = top.parent;
  }
  return { top, asData };
}

function enclosingFunction(node: TSESTree.Node): FunctionNode | undefined {
  const { parent } = node;
  if (parent?.type === AST_NODE_TYPES.ArrowFunctionExpression && parent.body === node) {
    return parent;
  }
  if (parent?.type !== AST_NODE_TYPES.ReturnStatement) {
    return undefined;
  }
  let current: TSESTree.Node | undefined = parent.parent;
  while (current && !isFunction(current)) {
    current = current.parent;
  }
  return current;
}

function isFunction(node: TSESTree.Node): node is FunctionNode {
  return (
    node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionDeclaration
  );
}

function bindingOf(fn: FunctionNode): TSESTree.Identifier | undefined {
  if (fn.type === AST_NODE_TYPES.FunctionDeclaration) {
    return fn.id ?? undefined;
  }
  const { parent } = fn;
  return parent.type === AST_NODE_TYPES.VariableDeclarator &&
    parent.id.type === AST_NODE_TYPES.Identifier
    ? parent.id
    : undefined;
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
  const binding = fn ? bindingOf(fn) : undefined;
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

export function reachesFileChange(context: SourceContext, node: TSESTree.Node, depth = 0): boolean {
  if (depth > MAX_DEPTH) {
    return false;
  }
  return usesOf(context, node).some((use) => {
    const carried = carrierOf(use);
    if (isChangeCall(carried)) {
      return true;
    }
    const { top } = carried;
    return top !== node && reachesFileChange(context, top, depth + 1);
  });
}
