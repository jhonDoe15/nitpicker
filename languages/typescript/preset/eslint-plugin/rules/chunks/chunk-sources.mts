import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { variableNamed } from '../typed/node-views.mts';
import { calleeNameOf } from '../typed/syntax-views.mts';
import { ts } from '../typed/typescript-views.mts';

export type Chunk = {
  readonly variable: TSESLint.Scope.Variable;
  readonly receiver: TSESTree.Node;
  readonly scopeNode: TSESTree.Node;
};

export type Services = {
  readonly checker: TypeScript.TypeChecker;
  readonly toTs: (node: TSESTree.Node) => TypeScript.Node;
};

const LISTENERS = new Set(['on', 'once', 'addListener', 'prependListener']);
const BINARY_TYPES = new Set(['Buffer', 'Uint8Array', 'ArrayBuffer', 'Uint8ClampedArray']);
const STREAM_TYPE =
  /Readable|Duplex|Transform|PassThrough|Socket|IncomingMessage|ReadStream|ChildProcess/u;
const STREAM_NAME = /^(?:stdout|stderr|stdin|socket|req|res|request|response|stream)$/u;
const ENCODED = /\bencoding\b|setEncoding/u;
const STRING_ENCODING = new RegExp(
  'createReadStream\\([^;]{0,200}?,\\s*[\'"`](?:utf-?8|utf16le|ucs-?2|latin1|binary|ascii|base64|hex)[\'"`]',
  'u',
);

function firstVariable(
  sourceCode: Readonly<TSESLint.SourceCode>,
  node: TSESTree.Node,
): TSESLint.Scope.Variable | undefined {
  return sourceCode.getDeclaredVariables(node)[0];
}

export function dataListener(
  sourceCode: Readonly<TSESLint.SourceCode>,
  node: TSESTree.CallExpression,
): Chunk | undefined {
  const { callee } = node;
  const [event, handler] = node.arguments;
  const registers =
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    LISTENERS.has(callee.property.name);
  const isFunction =
    handler?.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    handler?.type === AST_NODE_TYPES.FunctionExpression;
  const isData = event?.type === AST_NODE_TYPES.Literal && event.value === 'data';
  const variable = isFunction ? firstVariable(sourceCode, handler) : undefined;
  return registers && isData && isFunction && variable !== undefined
    ? { variable, receiver: callee.object, scopeNode: handler }
    : undefined;
}

export function streamLoop(
  sourceCode: Readonly<TSESLint.SourceCode>,
  node: TSESTree.ForOfStatement,
): Chunk | undefined {
  const { left } = node;
  const variable =
    left.type === AST_NODE_TYPES.VariableDeclaration ? firstVariable(sourceCode, left) : undefined;
  return node.await && variable !== undefined
    ? { variable, receiver: node.right, scopeNode: node.body }
    : undefined;
}

export function typeNames(services: Services, node: TSESTree.Node): string[] {
  const type = services.checker.getTypeAtLocation(services.toTs(node));
  const parts = type.isUnion() ? type.types : [type];
  return parts.map((part) => part.getSymbol()?.getName() ?? part.aliasSymbol?.getName() ?? '');
}

export function isAny(services: Services, node: TSESTree.Node): boolean {
  const flags = services.checker.getTypeAtLocation(services.toTs(node)).flags;
  return (flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0;
}

export function isBinaryChunk(services: Services, node: TSESTree.Node): boolean {
  return typeNames(services, node).some((name) => BINARY_TYPES.has(name));
}

export function isStreamReceiver(services: Services, receiver: TSESTree.Node): boolean {
  const name = calleeNameOf(receiver);
  return (
    (name !== undefined && STREAM_NAME.test(name)) ||
    typeNames(services, receiver).some((type) => STREAM_TYPE.test(type))
  );
}

export function hasEncodingEvidence(text: string): boolean {
  return ENCODED.test(text) || STRING_ENCODING.test(text);
}

export function yieldsStrings(
  sourceCode: Readonly<TSESLint.SourceCode>,
  receiver: TSESTree.Node,
): boolean {
  const [definition] =
    receiver.type === AST_NODE_TYPES.Identifier
      ? (variableNamed(sourceCode, receiver)?.defs ?? [])
      : [];
  const origin =
    definition?.node.type === AST_NODE_TYPES.VariableDeclarator ? definition.node.init : receiver;
  return (
    origin?.type === AST_NODE_TYPES.CallExpression &&
    sourceCode.getText(origin.callee) === 'Readable.from'
  );
}
