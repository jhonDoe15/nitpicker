import { ancestorsOf } from '../../ancestry.mjs';

const generators = new Set([
  'Math.random',
  'Date.now',
  'performance.now',
  'crypto.randomUUID',
  'randomUUID',
  'uuid',
  'uuidv4',
  'v4',
  'nanoid',
  'cuid',
  'createId',
]);

function calleeName(callee) {
  if (callee.type === 'Identifier') {
    return callee.name;
  }
  const isNamed =
    callee.type === 'MemberExpression' && !callee.computed && callee.object.type === 'Identifier';
  return isNamed ? `${callee.object.name}.${callee.property.name}` : undefined;
}

function isKeyAttribute(node) {
  return node.type === 'JSXAttribute' && node.name.name === 'key';
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow keys generated from randomness or the clock',
    },
    schema: [],
    messages: {
      randomKey:
        'Do not build a `key` from `{{call}}()`: it changes on every render and remounts the row. Use a stable id from the item (`key={todo.id}`) and generate ids when the item is created.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const call = calleeName(node.callee);
        const owner = ancestorsOf(node).find(({ type }) => type === 'JSXAttribute');
        if (generators.has(call) && owner !== undefined && isKeyAttribute(owner)) {
          context.report({ node, messageId: 'randomKey', data: { call } });
        }
      },
    };
  },
};
