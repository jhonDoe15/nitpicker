const MANAGED_RESOURCE = /(?:Service|Client|Pool|Cache|Store|Scheduler|Transport|Adapter)$/;
const VALUE_OBJECT =
  /^(?:Error|URL|Map|Set|WeakMap|WeakSet|Date|RegExp|Request|Response)$|(?:Request|Response|Command)$/;
const DEFAULT_COMPOSITION_ROOT_PATTERN =
  '(?:^|/)(?:main|server|composition-root)\\.ts$|(?:^|/)[^/]*factory[^/]*\\.ts$';

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

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Keep managed resource construction in approved composition roots',
    },
    schema: [
      {
        type: 'object',
        properties: {
          compositionRootPattern: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      outsideRoot: 'Construct {{name}} in an approved composition root and inject it here.',
    },
  },
  create(context) {
    const filename = context.filename.replaceAll('\\', '/');
    const compositionRoot = new RegExp(
      context.options[0]?.compositionRootPattern ?? DEFAULT_COMPOSITION_ROOT_PATTERN,
    );
    if (compositionRoot.test(filename)) {
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
