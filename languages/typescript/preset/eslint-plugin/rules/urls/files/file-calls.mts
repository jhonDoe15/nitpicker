import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  findVariable,
  resolveConstant,
  stringValue,
  type SourceContext,
} from '../../analysis/constant-resolution.mts';
import { nameOf } from '../../typed/node-views.mts';
import { ASSERTION_FORMS, unwrapOf } from '../../typed/syntax-views.mts';

const EXISTENCE_CALLS = new Set([
  'existsSync',
  'access',
  'accessSync',
  'pathExists',
  'pathExistsSync',
]);
const READ_CALLS = new Set([
  'readFile',
  'readFileSync',
  'createReadStream',
  'open',
  'openSync',
  'readJson',
  'readJsonSync',
  'readJSON',
  'readJSONSync',
]);
const FILE_OWNERS = new Set([
  'fs',
  'fsp',
  'fse',
  'fsPromises',
  'promises',
  'fsExtra',
  'fileSystem',
]);
const FILE_EXTENSION = /\.[A-Za-z][A-Za-z0-9]{0,7}$/u;
const NON_PROBE_MODES = new Set(['X_OK', 'W_OK']);

function fileCallName(node: TSESTree.CallExpression): string | undefined {
  const { callee } = node;
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name;
  }
  if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) {
    return undefined;
  }
  const owner = callee.object;
  const ownerName =
    owner.type === AST_NODE_TYPES.MemberExpression ? nameOf(owner.object) : nameOf(owner);
  return FILE_OWNERS.has(ownerName ?? '') ? nameOf(callee.property) : undefined;
}

export function existenceCheckedPath(node: TSESTree.Node): TSESTree.Node | undefined {
  const value = unwrapOf(node, [...ASSERTION_FORMS, AST_NODE_TYPES.AwaitExpression]);
  const [path, mode] = value.type === AST_NODE_TYPES.CallExpression ? value.arguments : [];
  const modeName =
    mode === undefined
      ? undefined
      : nameOf(mode.type === AST_NODE_TYPES.MemberExpression ? mode.property : mode);
  if (
    value.type !== AST_NODE_TYPES.CallExpression ||
    !EXISTENCE_CALLS.has(fileCallName(value) ?? '') ||
    path === undefined ||
    path.type === AST_NODE_TYPES.SpreadElement ||
    NON_PROBE_MODES.has(modeName ?? '')
  ) {
    return undefined;
  }
  return path;
}

export function readCallPath(node: TSESTree.CallExpression): TSESTree.Node | undefined {
  const [path] = node.arguments;
  return READ_CALLS.has(fileCallName(node) ?? '') && path?.type !== AST_NODE_TYPES.SpreadElement
    ? path
    : undefined;
}

const CONFIG_NAME =
  /^(?:options|opts|config|configuration|settings|params|args|input|ctx|context)$|config|option|setting/iu;
function endsWithFileName(context: SourceContext, node: TSESTree.Node): boolean {
  const value = unwrapOf(resolveConstant(context, node) ?? node, ASSERTION_FORMS);
  if (value.type === AST_NODE_TYPES.TemplateLiteral) {
    return FILE_EXTENSION.test(value.quasis.at(-1)?.value.cooked ?? '');
  }
  const text = stringValue(value);
  return text !== undefined && FILE_EXTENSION.test(text);
}

const ITERATION_CALLS = new Set([
  'map',
  'flatMap',
  'forEach',
  'filter',
  'some',
  'every',
  'find',
  'reduce',
]);

function rootsOf(node: TSESTree.Node): string[] {
  const names: string[] = [];
  const pending: TSESTree.Node[] = [node];
  for (const current of pending) {
    const value = unwrapOf(current, ASSERTION_FORMS);
    if (value.type === AST_NODE_TYPES.MemberExpression) {
      names.push(...(value.computed ? [] : [nameOf(value.property) ?? '']));
      pending.push(value.object);
    } else if (value.type === AST_NODE_TYPES.Identifier) {
      names.push(value.name);
    }
  }
  return names.toReversed();
}

const PATH_PARAMETER = /(?:file|path|filename)$/iu;

function isIterationVariable(context: SourceContext, node: TSESTree.Identifier): boolean {
  const [definition] = findVariable(context, node, node.name)?.defs ?? [];
  if (definition?.type === TSESLint.Scope.DefinitionType.Parameter) {
    const holder = definition.node.parent;
    const iterated =
      holder.type === AST_NODE_TYPES.CallExpression &&
      holder.callee.type === AST_NODE_TYPES.MemberExpression &&
      ITERATION_CALLS.has(nameOf(holder.callee.property) ?? '');
    return iterated || PATH_PARAMETER.test(node.name);
  }
  return (
    definition?.type === TSESLint.Scope.DefinitionType.Variable &&
    definition.parent.parent.type === AST_NODE_TYPES.ForOfStatement
  );
}

export function isConfiguredPath(context: SourceContext, node: TSESTree.Node): boolean {
  const value = unwrapOf(resolveConstant(context, node) ?? node, ASSERTION_FORMS);
  if (value.type === AST_NODE_TYPES.Identifier) {
    return isIterationVariable(context, value);
  }
  return (
    value.type === AST_NODE_TYPES.MemberExpression &&
    !endsWithFileName(context, value) &&
    rootsOf(value).some((name) => CONFIG_NAME.test(name))
  );
}
