import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { isFunctionNode } from '../caches/scope-names.mts';
import { isProbeOrOptions, mentionsLocalHelper } from './local-helper.mts';
import { isServer, serverBindings } from './server-origins.mts';

const LOCAL_HOSTS = new Set(['electron', 'vscode']);
const LOCAL_PATH = /(?:^|\/)(?:cli|electron|desktop|extension)(?:\/|\.)/u;

function hasHost(argument: TSESTree.CallExpressionArgument | undefined): boolean {
  if (argument === undefined) {
    return false;
  }
  if (argument.type === AST_NODE_TYPES.ObjectExpression) {
    return argument.properties.some(
      (property) =>
        property.type === AST_NODE_TYPES.SpreadElement ||
        (property.type === AST_NODE_TYPES.Property &&
          (property.computed ||
            (property.key.type === AST_NODE_TYPES.Identifier &&
              ['host', 'hostname', 'path'].includes(property.key.name)))),
    );
  }
  return false;
}

function listensWithoutHost(call: TSESTree.CallExpression): boolean {
  const [first, second, third] = call.arguments;
  if (first === undefined || first.type === AST_NODE_TYPES.SpreadElement) {
    return false;
  }
  if (first.type === AST_NODE_TYPES.ObjectExpression) {
    return !hasHost(first);
  }
  if (first.type === AST_NODE_TYPES.Literal && typeof first.value === 'string') {
    return false;
  }
  return (
    third === undefined && (second === undefined || isFunctionNode(second)) && !hasHost(second)
  );
}

export const rule: TSESLint.RuleModule<'allInterfaces', []> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Report a local callback or companion server that listens without a host',
    },
    schema: [],
    messages: {
      allInterfaces:
        "`listen` without a host binds every network interface, so this local server and what it receives (a sign-in code, a local API) is reachable from the network. Pass the loopback host: `server.listen(port, '127.0.0.1', callback)`.",
    },
  },
  create(context) {
    const { sourceCode } = context;
    const { modules, names } = serverBindings(sourceCode.ast);
    if (names.size === 0) {
      return {};
    }
    const localHost = [...modules].some((name) => LOCAL_HOSTS.has(name));
    const localPath = LOCAL_PATH.test(context.filename.replaceAll('\\', '/'));
    return {
      CallExpression(node) {
        const { callee } = node;
        const listens =
          callee.type === AST_NODE_TYPES.MemberExpression &&
          !callee.computed &&
          callee.property.type === AST_NODE_TYPES.Identifier &&
          callee.property.name === 'listen';
        if (
          !listens ||
          !listensWithoutHost(node) ||
          isProbeOrOptions(node, sourceCode) ||
          !isServer(sourceCode, callee.object, names) ||
          !(
            localHost ||
            localPath ||
            mentionsLocalHelper({
              sourceCode,
              call: node,
              receiver: callee.object,
              filename: context.filename,
            })
          )
        ) {
          return;
        }
        context.report({ node, messageId: 'allInterfaces' });
      },
    };
  },
};
