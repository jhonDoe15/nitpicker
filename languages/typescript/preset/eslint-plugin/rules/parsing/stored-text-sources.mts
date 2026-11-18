import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  findVariable,
  resolveConstant,
  type SourceContext,
} from '../analysis/constant-resolution.mts';
import { ASSERTION_FORMS, isFunction, unwrapOf } from '../typed/syntax-views.mts';
import { nameOf } from '../typed/node-views.mts';

const FILE_READS = new Set(['readFile', 'readFileSync']);
const STORAGES = new Set(['localStorage', 'sessionStorage']);
const TEXT_PEELS = new Set(['toString', 'trim', 'toLowerCase']);
const RESPONSES = /^(res|resp|response)$/i;
const MESSAGE_EVENTS = new Set(['message']);
const MAX_PEELS = 8;
const PROJECT_FILES = new RegExp(
  [
    'package|pkg|manifest|tsconfig|lock|schema|template|fixture|baseline|translation|locale',
    'i18n|openapi|import\\.meta|__dirname|__filename|json-?path|migrations|generators|executors',
  ].join('|'),
  'i',
);

function calleeName(node: TSESTree.CallExpression): string | undefined {
  return node.callee.type === AST_NODE_TYPES.MemberExpression
    ? nameOf(node.callee.property)
    : nameOf(node.callee);
}

function isStorage(node: TSESTree.Node): boolean {
  const value = unwrapOf(node, ASSERTION_FORMS);
  if (value.type === AST_NODE_TYPES.MemberExpression && !value.computed) {
    return STORAGES.has(nameOf(value.property) ?? '');
  }
  return STORAGES.has(nameOf(value) ?? '');
}

function isSourceCall(context: SourceContext, node: TSESTree.CallExpression): boolean {
  const name = calleeName(node);
  const { callee } = node;
  if (FILE_READS.has(name ?? '')) {
    return !isProjectFile(context, node.arguments[0]);
  }
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return false;
  }
  if (name === 'getItem') {
    return isStorage(callee.object);
  }
  return name === 'text' && RESPONSES.test(nameOf(callee.object) ?? '');
}

function isProjectFile(context: SourceContext, path: TSESTree.Node | undefined): boolean {
  if (path === undefined) {
    return true;
  }
  const resolved = resolveConstant(context, path) ?? path;
  const texts = [path, resolved].map((node) => context.sourceCode.getText(node));
  return (
    (resolved.type === AST_NODE_TYPES.Literal && typeof resolved.value === 'number') ||
    texts.some((text) => PROJECT_FILES.test(text))
  );
}

function isMessageHandler(node: TSESTree.Node | undefined): boolean {
  const call = node?.parent;
  if (call?.type !== AST_NODE_TYPES.CallExpression || !isFunction(node as TSESTree.Node)) {
    return false;
  }
  const [event] = call.arguments;
  return (
    ['on', 'once', 'addEventListener'].includes(calleeName(call) ?? '') &&
    event?.type === AST_NODE_TYPES.Literal &&
    MESSAGE_EVENTS.has(String(event.value))
  );
}

function isMessageParameter(context: SourceContext, node: TSESTree.Node): boolean {
  if (node.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  const [definition, ...others] = findVariable(context, node, node.name)?.defs ?? [];
  if (others.length > 0 || definition?.type !== TSESLint.Scope.DefinitionType.Parameter) {
    return false;
  }
  const owner = definition.node;
  return isFunction(owner) && owner.params[0] === definition.name && isMessageHandler(owner);
}

function peeled(context: SourceContext, node: TSESTree.Node): TSESTree.Node {
  let current = resolveConstant(context, unwrapOf(node, ASSERTION_FORMS)) ?? node;
  for (let step = 0; step < MAX_PEELS; step += 1) {
    const next = peelOnce(current);
    if (next === undefined) {
      break;
    }
    current = resolveConstant(context, next) ?? next;
  }
  return current;
}

function peelOnce(node: TSESTree.Node): TSESTree.Node | undefined {
  if (node.type === AST_NODE_TYPES.AwaitExpression) {
    return node.argument;
  }
  if (
    node.type === AST_NODE_TYPES.ChainExpression ||
    node.type === AST_NODE_TYPES.TSNonNullExpression
  ) {
    return node.expression;
  }
  if (node.type === AST_NODE_TYPES.LogicalExpression && node.operator !== '&&') {
    return node.left;
  }
  if (node.type === AST_NODE_TYPES.TSAsExpression) {
    return node.expression;
  }
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return undefined;
  }
  const [first] = node.arguments;
  if (
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    TEXT_PEELS.has(nameOf(node.callee.property) ?? '')
  ) {
    return node.callee.object;
  }
  return nameOf(node.callee) === 'String' ? first : undefined;
}

export function isStoredText(context: SourceContext, argument: TSESTree.Node): boolean {
  const source = peeled(context, argument);
  if (source.type === AST_NODE_TYPES.CallExpression) {
    return isSourceCall(context, source);
  }
  if (source.type === AST_NODE_TYPES.MemberExpression && nameOf(source.property) === 'data') {
    return isMessageParameter(context, source.object);
  }
  return isMessageParameter(context, source);
}
