import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { plainName } from '../encoding/plain-names.mts';
import { findVariable, resolveConstant, stringValue } from '../analysis/constant-resolution.mts';
import {
  memberName,
  propertyNamed,
  unwrapped,
  type Context,
} from '../security/security-values.mts';

export type SourceKind = 'decoder' | 'file';
export type DecodedSource = { readonly kind: SourceKind; readonly path?: string | undefined };

const UTF8 = /^utf-?8$/iu;
const READ_FILE = new Set(['readFile', 'readFileSync']);
const TEXT_FILE = /\.(?:json|md|ts|js|mjs|yml|yaml|toml|txt|html|css)['"`]$|json|config|manifest/iu;
const TOOLING_FILE = /(?:^|\/)(?:build|scripts?|tools)\//u;
const BASE64_TEXT = /base64|atob/iu;

function isTextDecoder(node: TSESTree.Node | undefined): node is TSESTree.NewExpression {
  return (
    node?.type === AST_NODE_TYPES.NewExpression &&
    node.callee.type === AST_NODE_TYPES.Identifier &&
    node.callee.name === 'TextDecoder'
  );
}

function isLenientUtf8(context: Context, decoder: TSESTree.NewExpression): boolean {
  const [label, options] = decoder.arguments;
  if (label !== undefined && !UTF8.test(stringValue(label) ?? '')) {
    return false;
  }
  if (options === undefined) {
    return true;
  }
  if (options.type !== AST_NODE_TYPES.ObjectExpression) {
    return false;
  }
  if (options.properties.some((entry) => entry.type !== AST_NODE_TYPES.Property)) {
    return false;
  }
  const fatal = propertyNamed(context, options, 'fatal');
  return fatal === undefined || (fatal.type === AST_NODE_TYPES.Literal && fatal.value === false);
}

function decoderOf(context: Context, object: TSESTree.Node): TSESTree.NewExpression | undefined {
  const plain = unwrapped(object);
  if (isTextDecoder(plain)) {
    return plain;
  }
  if (plain.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  const definition = findVariable(context, plain, plain.name)?.defs.at(0);
  const init =
    definition?.node.type === AST_NODE_TYPES.VariableDeclarator ? definition.node.init : null;
  return init !== null && isTextDecoder(init) ? init : undefined;
}

function utf8Encoding(context: Context, node: TSESTree.Node | undefined): boolean {
  const plain = resolveConstant(context, node);
  if (plain?.type === AST_NODE_TYPES.ObjectExpression) {
    return UTF8.test(stringValue(propertyNamed(context, plain, 'encoding')) ?? '');
  }
  return UTF8.test(stringValue(plain) ?? '');
}

function bufferRead(context: Context, node: TSESTree.Node): string | undefined {
  const plain = unwrapped(node);
  const inner = plain.type === AST_NODE_TYPES.AwaitExpression ? unwrapped(plain.argument) : plain;
  if (
    inner.type === AST_NODE_TYPES.CallExpression &&
    READ_FILE.has(plainName(inner.callee) ?? '')
  ) {
    const [path, encoding] = inner.arguments;
    return path !== undefined && encoding === undefined
      ? context.sourceCode.getText(path)
      : undefined;
  }
  if (inner.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  const definition = findVariable(context, inner, inner.name)?.defs.at(0);
  const init =
    definition?.node.type === AST_NODE_TYPES.VariableDeclarator ? definition.node.init : null;
  return init === null || init === undefined ? undefined : bufferRead(context, init);
}

function isAuthoredText(context: Context, path: string): boolean {
  return TEXT_FILE.test(path) || TOOLING_FILE.test(context.filename);
}

function fileSource(context: Context, call: TSESTree.CallExpression): DecodedSource | undefined {
  const [path, encoding] = call.arguments;
  if (!READ_FILE.has(plainName(call.callee) ?? '') || path === undefined) {
    return undefined;
  }
  const text = context.sourceCode.getText(path);
  return utf8Encoding(context, encoding) && !isAuthoredText(context, text)
    ? { kind: 'file', path: text }
    : undefined;
}

function toStringSource(
  context: Context,
  call: TSESTree.CallExpression,
): DecodedSource | undefined {
  const callee = unwrapped(call.callee);
  if (callee.type !== AST_NODE_TYPES.MemberExpression || memberName(callee) !== 'toString') {
    return undefined;
  }
  const path = bufferRead(context, callee.object);
  return path !== undefined &&
    utf8Encoding(context, call.arguments[0]) &&
    !isAuthoredText(context, path)
    ? { kind: 'file', path }
    : undefined;
}

function decodeSource(context: Context, call: TSESTree.CallExpression): DecodedSource | undefined {
  const callee = unwrapped(call.callee);
  if (callee.type !== AST_NODE_TYPES.MemberExpression || memberName(callee) !== 'decode') {
    return undefined;
  }
  const decoder = decoderOf(context, callee.object);
  const [input] = call.arguments;
  const token = input !== undefined && BASE64_TEXT.test(context.sourceCode.getText(input));
  return decoder !== undefined &&
    call.arguments.length === 1 &&
    !token &&
    isLenientUtf8(context, decoder)
    ? { kind: 'decoder' }
    : undefined;
}

export function decodedSource(
  context: Context,
  call: TSESTree.CallExpression,
): DecodedSource | undefined {
  return decodeSource(context, call) ?? fileSource(context, call) ?? toStringSource(context, call);
}
