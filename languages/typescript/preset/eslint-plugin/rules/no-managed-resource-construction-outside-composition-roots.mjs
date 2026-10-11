import { compositionRootOptionsSchema, isCompositionRootFile } from './composition-root-files.mjs';

const MANAGED_RESOURCE = /(?:Service|Client|Pool|Cache|Store|Scheduler|Transport|Adapter)$/;
const VALUE_OBJECT =
  /^(?:Error|URL|Map|Set|WeakMap|WeakSet|Date|RegExp|Request|Response)$|(?:Request|Response|Command)$/;

function constructedName(callee) {
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

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Keep managed resource construction in approved composition roots',
    },
    schema: compositionRootOptionsSchema,
    messages: {
      outsideRoot:
        'Construct {{name}} only in the composition root (composition-root.ts, main.ts or server.ts) and pass it in as a parameter.',
    },
  },
  create(context) {
    if (isCompositionRootFile(context)) {
      return {};
    }

    return {
      NewExpression(node) {
        const name = constructedName(node.callee);
        if (name !== undefined && MANAGED_RESOURCE.test(name) && !VALUE_OBJECT.test(name)) {
          context.report({ node, messageId: 'outsideRoot', data: { name } });
        }
      },
    };
  },
};
