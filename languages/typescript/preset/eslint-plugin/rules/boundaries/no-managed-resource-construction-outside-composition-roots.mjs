import { compositionRootOptionsSchema, isCompositionRootFile } from './composition-root-files.mjs';

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

function calleeName(callee) {
  if (callee.type === 'Identifier') {
    return callee.name;
  }
  if (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier'
  ) {
    return callee.property.name;
  }
  return undefined;
}

function isResourceFactoryCall(callee) {
  const name = calleeName(callee);
  if (name === undefined) {
    return false;
  }
  if (RESOURCE_FACTORY.test(name)) {
    return true;
  }
  return (
    callee.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    RESOURCE_FACTORY_MEMBERS.has(`${callee.object.name}.${name}`)
  );
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Keep managed resource construction in approved composition roots',
    },
    schema: compositionRootOptionsSchema,
    messages: {
      outsideRoot:
        'Construct {{name}} only in the composition root (src/main/composition-root.ts, main.ts or server.ts) and pass it in as a parameter. If it is a plain value, not a long-lived resource, add an exception for this rule in nitpicker.config.json.',
    },
  },
  create(context) {
    if (isCompositionRootFile(context)) {
      return {};
    }

    function report(node, name) {
      context.report({ node, messageId: 'outsideRoot', data: { name } });
    }

    return {
      NewExpression(node) {
        const name = calleeName(node.callee);
        if (name !== undefined && MANAGED_RESOURCE.test(name) && !VALUE_OBJECT.test(name)) {
          report(node, name);
        }
      },
      CallExpression(node) {
        if (isResourceFactoryCall(node.callee)) {
          report(node, calleeName(node.callee));
        }
      },
    };
  },
};
