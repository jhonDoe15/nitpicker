import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  compositionRootOptionsSchema,
  isCompositionRootFile,
  type CompositionRootOptions,
} from './composition-root-files.mts';

const MANAGED_SUFFIXES = [
  'Service',
  'Client',
  'Pool',
  'Cache',
  'Store',
  'Scheduler',
  'Transport',
  'Adapter',
  'Server',
  'Worker',
  'Connection',
  'Queue',
  'Producer',
  'Consumer',
  'Broker',
  'Gateway',
  'Database',
  'DatabaseSync',
  'Emitter',
];
const MANAGED_NAMES = ['Redis', 'Stripe', 'Octokit', 'OpenAI', 'Socket', 'WebSocket'];
const MANAGED_RESOURCE = new RegExp(
  `(?:${MANAGED_SUFFIXES.join('|')})$|^(?:${MANAGED_NAMES.join('|')})$`,
  'u',
);
const VALUE_OBJECT =
  /^(?:Error|URL|Map|Set|WeakMap|WeakSet|Date|RegExp|Request|Response)$|(?:Request|Response|Command)$/;
const RESOURCE_FACTORY =
  /^create(?:Server|SecureServer|Client|Pool|Connection|Worker|Transport|Queue|Cache|Store|Scheduler)$/;
const RESOURCE_FACTORY_MEMBERS = new Set(['axios.create']);

function calleeName(callee: TSESTree.Node): string | undefined {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name;
  }
  if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier
  ) {
    return callee.property.name;
  }
  return undefined;
}

function isResourceFactoryCall(callee: TSESTree.Node): boolean {
  const name = calleeName(callee);
  if (name === undefined) {
    return false;
  }
  if (RESOURCE_FACTORY.test(name)) {
    return true;
  }
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    RESOURCE_FACTORY_MEMBERS.has(`${callee.object.name}.${name}`)
  );
}

export const rule: TSESLint.RuleModule<'outsideRoot', CompositionRootOptions> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Keep managed resource construction in approved composition roots',
    },
    schema: compositionRootOptionsSchema,
    messages: {
      outsideRoot:
        'Construct {{name}} only in the composition root (src/main/composition-root.ts, main.ts or server.ts) and pass it in as a parameter. An exception fits only when it is a plain value, not a long-lived resource.',
    },
  },
  create(context) {
    if (isCompositionRootFile(context)) {
      return {};
    }

    function report(
      node: TSESTree.NewExpression | TSESTree.CallExpression,
      name: string | undefined,
    ): void {
      context.report({ node, messageId: 'outsideRoot', data: { name } });
    }

    return {
      NewExpression(node: TSESTree.NewExpression) {
        const name = calleeName(node.callee);
        if (name !== undefined && MANAGED_RESOURCE.test(name) && !VALUE_OBJECT.test(name)) {
          report(node, name);
        }
      },
      CallExpression(node: TSESTree.CallExpression) {
        if (isResourceFactoryCall(node.callee)) {
          report(node, calleeName(node.callee));
        }
      },
    };
  },
};
