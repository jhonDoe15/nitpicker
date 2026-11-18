import path from 'node:path';
import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { enclosingFunction, isFunctionNode, variableOf } from '../caches/scope-names.mts';
import type { SourceCode } from '../typed/node-views.mts';

const LOCAL_HELPER = new RegExp(
  'oauth|redirect|authori[sz]|loopback|login|auth_?code|openbrowser|callbackserver|' +
    'callbackport|callbackurl|authcallback',
  'iu',
);
const SSO = /(?:^|[^A-Za-z])sso(?![a-z])|Sso(?![a-z])|(?<![A-Z])SSO(?![A-Z])/u;
const OPTIONS_NAME = /opt|config|setting|arg|param|address|bind/iu;

type Creation = TSESTree.CallExpression | TSESTree.NewExpression;

export type Listen = {
  readonly sourceCode: SourceCode;
  readonly call: TSESTree.CallExpression;
  readonly receiver: TSESTree.Node;
  readonly filename: string;
};

function ownerNames(owner: TSESTree.Node): string[] {
  const parent = owner.parent;
  const own = 'id' in owner && owner.id?.type === AST_NODE_TYPES.Identifier ? [owner.id.name] : [];
  const declared =
    parent?.type === AST_NODE_TYPES.VariableDeclarator &&
    parent.id.type === AST_NODE_TYPES.Identifier
      ? [parent.id.name]
      : [];
  const method =
    parent?.type === AST_NODE_TYPES.MethodDefinition &&
    parent.key.type === AST_NODE_TYPES.Identifier
      ? [parent.key.name]
      : [];
  return [...own, ...declared, ...method];
}

function creationOf(sourceCode: SourceCode, receiver: TSESTree.Node): Creation | undefined {
  if (
    receiver.type === AST_NODE_TYPES.CallExpression ||
    receiver.type === AST_NODE_TYPES.NewExpression
  ) {
    return receiver;
  }
  if (receiver.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  const [definition] = variableOf(sourceCode, receiver)?.defs ?? [];
  const init =
    definition?.node.type === AST_NODE_TYPES.VariableDeclarator ? definition.node.init : null;
  return init?.type === AST_NODE_TYPES.CallExpression || init?.type === AST_NODE_TYPES.NewExpression
    ? init
    : undefined;
}

function ownTexts({ sourceCode, call, receiver }: Listen): string[] {
  const handlers = (creationOf(sourceCode, receiver)?.arguments ?? []).filter(
    (argument) => isFunctionNode(argument) || argument.type === AST_NODE_TYPES.Identifier,
  );
  return [...handlers, ...call.arguments.filter(isFunctionNode)].map((node) =>
    sourceCode.getText(node),
  );
}

export function mentionsLocalHelper(listen: Listen): boolean {
  const owner = enclosingFunction(listen.call);
  const texts = [
    ...(listen.receiver.type === AST_NODE_TYPES.Identifier ? [listen.receiver.name] : []),
    path.basename(listen.filename),
    ...(owner === undefined ? [] : ownerNames(owner)),
    ...ownTexts(listen),
  ];
  return texts.some((text) => LOCAL_HELPER.test(text) || SSO.test(text));
}

function closesInCallback(call: TSESTree.CallExpression, sourceCode: SourceCode): boolean {
  return call.arguments.some(
    (argument) => isFunctionNode(argument) && /\.close\(/u.test(sourceCode.getText(argument)),
  );
}

export function isProbeOrOptions(call: TSESTree.CallExpression, sourceCode: SourceCode): boolean {
  const [first] = call.arguments;
  if (first?.type === AST_NODE_TYPES.Literal && first.value === 0) {
    return true;
  }
  if (first?.type === AST_NODE_TYPES.Identifier && OPTIONS_NAME.test(first.name)) {
    return true;
  }
  return closesInCallback(call, sourceCode);
}
