import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  findVariable,
  resolveConstant,
  stringValue,
  type SourceContext,
} from '../analysis/constant-resolution.mts';
import { nameOf } from '../typed/node-views.mts';
import { calleeNameOf, TYPE_WRAPPERS, unwrapOf, unwrapped } from '../typed/syntax-views.mts';

const wordSet = (words: string): ReadonlySet<string> => new Set(words.split(' '));

const SOURCE_EXTENSIONS = '.java .ts .js .py .kt .go .tsx .jsx .mts .mjs .cjs .cts .rs'.split(' ');
const READ_FILE_METHODS = wordSet('readFileSync readFile');
const PATH_JOIN_METHODS = wordSet('join resolve');
const PASSTHROUGH_STRING_METHODS = wordSet(
  'trim trimStart trimEnd slice substring substr toLowerCase toUpperCase normalize replace replaceAll',
);
const SOURCE_SUFFIXES = wordSet('text code content contents body string str lines file');
const CODE_SUFFIXES = wordSet('text content contents string str body lines');
const FILE_SUFFIXES = wordSet('content contents text source code body');
const SOURCE_PREFIXES = wordSet(
  'file raw input program module script original full js ts jsx tsx mts mjs cjs cts java py python kt kotlin go golang rs rust c cpp cs csharp rb ruby php swift scala',
);
const CODE_MEMBER_OBJECTS = wordSet('file module script program unit entry chunk');
const NON_SOURCE_MEMBER_OBJECTS = wordSet('event audio video image data media stream font');

const VALUE_WRAPPERS = [...TYPE_WRAPPERS, AST_NODE_TYPES.AwaitExpression];
const MAX_TRACE_DEPTH = 4;

export function splitWords(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[_\-\s]+/)
    .filter((part) => part.length > 0);
}

export function isSourceName(name: string): boolean {
  const words = splitWords(name);
  if (words.length === 0) {
    return false;
  }
  const [first, second] = words;
  if (words.length === 1) {
    return first === 'source' || first === 'code';
  }
  if (first === 'source' && second !== undefined && SOURCE_SUFFIXES.has(second)) {
    return true;
  }
  if (first === 'code' && second !== undefined && CODE_SUFFIXES.has(second)) {
    return true;
  }
  if (first === 'file' && second !== undefined && FILE_SUFFIXES.has(second)) {
    return true;
  }
  const last = words.at(-1);
  return (
    (last === 'source' || last === 'code') &&
    words.slice(0, -1).every((word) => SOURCE_PREFIXES.has(word))
  );
}

export function callMethodName(node: TSESTree.CallExpression): string | undefined {
  return calleeNameOf(unwrapped(node.callee));
}

function pathJoinLastArg(node: TSESTree.CallExpression): TSESTree.Expression | undefined {
  const method = callMethodName(node);
  const lastArg = node.arguments.at(-1);
  return method !== undefined &&
    PATH_JOIN_METHODS.has(method) &&
    lastArg !== undefined &&
    lastArg.type !== AST_NODE_TYPES.SpreadElement
    ? lastArg
    : undefined;
}

function pathSuffixText(
  context: SourceContext,
  node: TSESTree.Node,
  depth = 0,
): string | undefined {
  if (depth > MAX_TRACE_DEPTH) {
    return undefined;
  }
  const resolved = resolveConstant(context, unwrapOf(node, VALUE_WRAPPERS));
  if (resolved === undefined) {
    return undefined;
  }
  const literal = stringValue(resolved);
  if (literal !== undefined) {
    return literal;
  }
  if (resolved.type === AST_NODE_TYPES.TemplateLiteral) {
    return resolved.quasis.at(-1)?.value.cooked ?? undefined;
  }
  if (resolved.type === AST_NODE_TYPES.BinaryExpression && resolved.operator === '+') {
    return pathSuffixText(context, resolved.right, depth + 1);
  }
  const joined =
    resolved.type === AST_NODE_TYPES.CallExpression ? pathJoinLastArg(resolved) : undefined;
  return joined === undefined ? undefined : pathSuffixText(context, joined, depth + 1);
}

function fileReadClassification(
  context: SourceContext,
  node: TSESTree.Node,
): 'source' | 'non-source' | undefined {
  const target = unwrapOf(node, VALUE_WRAPPERS);
  if (target.type !== AST_NODE_TYPES.CallExpression) {
    return undefined;
  }
  const method = callMethodName(target);
  const [pathArg] = target.arguments;
  if (
    method === undefined ||
    !READ_FILE_METHODS.has(method) ||
    pathArg === undefined ||
    pathArg.type === AST_NODE_TYPES.SpreadElement
  ) {
    return undefined;
  }
  const suffix = pathSuffixText(context, pathArg)?.toLowerCase();
  if (suffix === undefined || suffix.length === 0) {
    return undefined;
  }
  if (SOURCE_EXTENSIONS.some((ext) => suffix.endsWith(ext))) {
    return 'source';
  }
  return /\.[a-z0-9]+$/.test(suffix) ? 'non-source' : undefined;
}

function variableInitializer(
  context: SourceContext,
  identifier: TSESTree.Identifier,
): TSESTree.Expression | undefined {
  const variable = findVariable(context, identifier, identifier.name);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  return definition?.type === TSESLint.Scope.DefinitionType.Variable &&
    definition.node.id.type === AST_NODE_TYPES.Identifier &&
    definition.node.init !== null
    ? definition.node.init
    : undefined;
}

function memberHoldsSource(node: TSESTree.MemberExpression): boolean {
  if (node.computed) {
    return false;
  }
  const prop = nameOf(node.property);
  if (prop === undefined) {
    return false;
  }
  const objName = nameOf(node.object)?.toLowerCase();
  if (prop === 'code') {
    return objName !== undefined && CODE_MEMBER_OBJECTS.has(objName);
  }
  if (prop === 'source') {
    return objName === undefined || !NON_SOURCE_MEMBER_OBJECTS.has(objName);
  }
  return isSourceName(prop);
}

function identifierHoldsSource(
  context: SourceContext,
  target: TSESTree.Identifier,
  depth: number,
): boolean {
  const init = variableInitializer(context, target);
  if (init === undefined) {
    return isSourceName(target.name);
  }
  const initReadKind = fileReadClassification(context, init);
  if (initReadKind !== undefined) {
    return initReadKind === 'source';
  }
  return holdsSourceCode(context, init, depth + 1) || isSourceName(target.name);
}

function passthroughReceiver(node: TSESTree.CallExpression): TSESTree.Expression | undefined {
  if (node.callee.type !== AST_NODE_TYPES.MemberExpression || node.callee.computed) {
    return undefined;
  }
  const method = nameOf(node.callee.property);
  return method !== undefined && PASSTHROUGH_STRING_METHODS.has(method)
    ? node.callee.object
    : undefined;
}

export function holdsSourceCode(context: SourceContext, node: TSESTree.Node, depth = 0): boolean {
  if (depth > MAX_TRACE_DEPTH) {
    return false;
  }
  const target = unwrapOf(node, VALUE_WRAPPERS);
  const readKind = fileReadClassification(context, target);
  if (readKind !== undefined) {
    return readKind === 'source';
  }
  if (target.type === AST_NODE_TYPES.Identifier) {
    return identifierHoldsSource(context, target, depth);
  }
  if (target.type === AST_NODE_TYPES.MemberExpression) {
    return memberHoldsSource(target);
  }
  const receiver =
    target.type === AST_NODE_TYPES.CallExpression ? passthroughReceiver(target) : undefined;
  return receiver !== undefined && holdsSourceCode(context, receiver, depth + 1);
}
