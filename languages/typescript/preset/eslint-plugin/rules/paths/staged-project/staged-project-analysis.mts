import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  resolveConstant,
  stringValue,
  type SourceContext,
} from '../../analysis/constant-resolution.mts';
import { forEachNode } from '../../analysis/node/wrapper-calls.mts';
import { propertyKeyName } from '../../analysis/test-code-analysis.mts';
import { calleeName, referencesAny } from '../../repeated-work/support/ast-walk.mts';

const MKDTEMP_NAMES = new Set(['mkdtemp', 'mkdtempSync']);
const READDIR_NAMES = new Set(['readdir', 'readdirSync']);
const ENTRY_COPY_NAMES = new Set([
  'symlink',
  'symlinkSync',
  'cp',
  'cpSync',
  'copyFile',
  'copyFileSync',
]);
const WRITE_FILE_NAMES = new Set(['writeFile', 'writeFileSync']);
const PROJECT_FLAGS = new Set(['-p', '--project', '--tsconfig']);
const PROJECT_CONFIG_FILE = /(?:^|\/)(?:tsconfig[^/]*\.json|package\.json)$/iu;
const MITIGATION_KEYS = new Set(['NODE_PATH', 'typeRoots', 'paths']);
const PARENT_WALK_IDENT = /^(?:dirname|parent|ancestor)/iu;

export type TempDirInfo = {
  readonly call: TSESTree.CallExpression;
  readonly binding: string;
};

function containsCall(
  context: SourceContext,
  root: TSESTree.Node,
  names: ReadonlySet<string>,
): boolean {
  let found = false;
  forEachNode(context, root, (node) => {
    if (!found && node.type === AST_NODE_TYPES.CallExpression) {
      const name = calleeName(node.callee);
      found = name !== undefined && names.has(name);
    }
  });
  return found;
}

function usesTmpdir(context: SourceContext, node: TSESTree.Node | undefined): boolean {
  if (node === undefined) {
    return false;
  }
  const resolved = resolveConstant(context, node) ?? node;
  return containsCall(context, resolved, new Set(['tmpdir']));
}

function enclosingDeclaratorName(call: TSESTree.CallExpression): string | undefined {
  const parent =
    call.parent?.type === AST_NODE_TYPES.AwaitExpression ? call.parent.parent : call.parent;
  return parent?.type === AST_NODE_TYPES.VariableDeclarator &&
    parent.id.type === AST_NODE_TYPES.Identifier
    ? parent.id.name
    : undefined;
}

export function findTmpdirMkdtemp(
  context: SourceContext,
  body: TSESTree.BlockStatement,
): TempDirInfo | undefined {
  let found: TempDirInfo | undefined;
  forEachNode(context, body, (node) => {
    if (found !== undefined || node.type !== AST_NODE_TYPES.CallExpression) {
      return;
    }
    const name = calleeName(node.callee);
    const binding = enclosingDeclaratorName(node);
    if (
      name !== undefined &&
      MKDTEMP_NAMES.has(name) &&
      binding !== undefined &&
      usesTmpdir(context, node.arguments[0])
    ) {
      found = { call: node, binding };
    }
  });
  return found;
}

function collectReaddirBindings(
  context: SourceContext,
  body: TSESTree.BlockStatement,
): Set<string> {
  const names = new Set<string>();
  forEachNode(context, body, (node) => {
    if (
      node.type === AST_NODE_TYPES.VariableDeclarator &&
      node.id.type === AST_NODE_TYPES.Identifier &&
      node.init !== null &&
      containsCall(context, node.init, READDIR_NAMES)
    ) {
      names.add(node.id.name);
    }
  });
  return names;
}

function isReaddirSource(
  context: SourceContext,
  node: TSESTree.Node,
  readdirBindings: ReadonlySet<string>,
): boolean {
  if (node.type === AST_NODE_TYPES.Identifier && readdirBindings.has(node.name)) {
    return true;
  }
  return containsCall(context, node, READDIR_NAMES);
}

function loopCopiesFromReaddir(
  context: SourceContext,
  node: TSESTree.Node,
  readdirBindings: ReadonlySet<string>,
): boolean {
  if (node.type === AST_NODE_TYPES.ForOfStatement) {
    return (
      isReaddirSource(context, node.right, readdirBindings) &&
      containsCall(context, node.body, ENTRY_COPY_NAMES)
    );
  }
  if (
    node.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    !node.callee.computed &&
    node.callee.property.type === AST_NODE_TYPES.Identifier &&
    (node.callee.property.name === 'forEach' || node.callee.property.name === 'map')
  ) {
    const callback = node.arguments[0];
    return (
      callback !== undefined &&
      isReaddirSource(context, node.callee.object, readdirBindings) &&
      containsCall(context, callback, ENTRY_COPY_NAMES)
    );
  }
  return false;
}

export function hasReaddirStagingLoop(
  context: SourceContext,
  body: TSESTree.BlockStatement,
): boolean {
  const readdirBindings = collectReaddirBindings(context, body);
  let found = false;
  forEachNode(context, body, (node) => {
    if (!found && loopCopiesFromReaddir(context, node, readdirBindings)) {
      found = true;
    }
  });
  return found;
}

function referencesIdentifier(context: SourceContext, root: TSESTree.Node, name: string): boolean {
  return referencesAny(context, root, new Set([name]));
}

function writesProjectConfig(
  context: SourceContext,
  call: TSESTree.CallExpression,
  tempDir: string,
): boolean {
  const name = calleeName(call.callee);
  const target = call.arguments[0];
  if (name === undefined || !WRITE_FILE_NAMES.has(name) || target === undefined) {
    return false;
  }
  const resolved = resolveConstant(context, target) ?? target;
  let hasConfigName = false;
  forEachNode(context, resolved, (node) => {
    const text = stringValue(node);
    if (text !== undefined && PROJECT_CONFIG_FILE.test(text.replaceAll('\\', '/'))) {
      hasConfigName = true;
    }
  });
  return hasConfigName && referencesIdentifier(context, resolved, tempDir);
}

function passesTempDirAsProjectArg(
  context: SourceContext,
  node: TSESTree.ArrayExpression,
  tempDir: string,
): boolean {
  for (let index = 0; index < node.elements.length; index += 1) {
    const element = node.elements[index];
    const next = node.elements[index + 1];
    if (
      element === null ||
      element === undefined ||
      element.type === AST_NODE_TYPES.SpreadElement
    ) {
      continue;
    }
    const text = stringValue(resolveConstant(context, element));
    if (
      text !== undefined &&
      PROJECT_FLAGS.has(text) &&
      next !== null &&
      next !== undefined &&
      referencesIdentifier(context, next, tempDir)
    ) {
      return true;
    }
  }
  return false;
}

export function usesStagedDirForProject(
  context: SourceContext,
  body: TSESTree.BlockStatement,
  tempDir: string,
): boolean {
  let found = false;
  forEachNode(context, body, (node) => {
    if (found) {
      return;
    }
    if (
      node.type === AST_NODE_TYPES.CallExpression &&
      writesProjectConfig(context, node, tempDir)
    ) {
      found = true;
      return;
    }
    if (
      node.type === AST_NODE_TYPES.Property &&
      propertyKeyName(node) === 'cwd' &&
      referencesIdentifier(context, node.value, tempDir)
    ) {
      found = true;
      return;
    }
    if (
      node.type === AST_NODE_TYPES.ArrayExpression &&
      passesTempDirAsProjectArg(context, node, tempDir)
    ) {
      found = true;
    }
  });
  return found;
}

function inspectMitigationNode(
  node: TSESTree.Node,
  state: { hasDirect: boolean; hasNodeModules: boolean; hasParentRef: boolean },
): void {
  const text = stringValue(node);
  if (text !== undefined) {
    state.hasDirect =
      state.hasDirect || text.includes('--preserve-symlinks') || MITIGATION_KEYS.has(text);
    state.hasNodeModules = state.hasNodeModules || text.includes('node_modules');
    state.hasParentRef = state.hasParentRef || text === '..' || text.includes('../');
    return;
  }
  if (node.type === AST_NODE_TYPES.Property) {
    const key = propertyKeyName(node);
    state.hasDirect = state.hasDirect || (key !== undefined && MITIGATION_KEYS.has(key));
    return;
  }
  if (node.type === AST_NODE_TYPES.Identifier && PARENT_WALK_IDENT.test(node.name)) {
    state.hasParentRef = true;
  }
}

export function hasNodeModulesMitigation(context: SourceContext, root: TSESTree.Node): boolean {
  const state = { hasDirect: false, hasNodeModules: false, hasParentRef: false };
  forEachNode(context, root, (node) => inspectMitigationNode(node, state));
  return state.hasDirect || (state.hasNodeModules && state.hasParentRef);
}
