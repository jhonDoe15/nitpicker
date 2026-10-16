import { ancestorsOf, variableNamed } from '../../analysis/ancestry.mjs';
import { isFunctionNode } from '../react-effects.mjs';
import { attributeNamed } from '../jsx.mjs';

const globalGenerators = new Set([
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
const generatorModules = new Set([
  'uuid',
  'nanoid',
  'nanoid/non-secure',
  'cuid',
  '@paralleldrive/cuid2',
  'ulid',
  'short-uuid',
]);
const cryptoModules = new Set(['crypto', 'node:crypto']);
const globalObjects = new Set(['window', 'globalThis', 'self']);

function memberChain(node) {
  if (node.type === 'Identifier') {
    return [node];
  }
  const isNamed = node.type === 'MemberExpression' && !node.computed;
  const object = isNamed ? memberChain(node.object) : undefined;
  return object === undefined ? undefined : [...object, node.property];
}

function withoutGlobalObject(names) {
  return names.length > 1 && globalObjects.has(names[0]) ? names.slice(1) : names;
}

function importOf(sourceCode, identifier) {
  const variable = variableNamed(sourceCode, identifier);
  if (variable === undefined || variable.defs.length === 0) {
    return { bound: false };
  }
  const definition = variable.defs.find(({ type }) => type === 'ImportBinding');
  return { bound: true, source: definition?.parent.source.value };
}

function isImportedGenerator(source, names) {
  return (
    generatorModules.has(source) || (cryptoModules.has(source) && names.at(-1) === 'randomUUID')
  );
}

function generatorName(sourceCode, callee) {
  const chain = memberChain(callee);
  if (chain === undefined) {
    return undefined;
  }
  const names = chain.map(({ name }) => name);
  const { bound, source } = importOf(sourceCode, chain[0]);
  const isGenerator = bound
    ? source !== undefined && isImportedGenerator(source, names)
    : globalGenerators.has(withoutGlobalObject(names).join('.'));
  return isGenerator ? names.join('.') : undefined;
}

function isClockRead(sourceCode, node) {
  return (
    node.callee.type === 'Identifier' &&
    node.callee.name === 'Date' &&
    node.arguments.length === 0 &&
    !importOf(sourceCode, node.callee).bound
  );
}

function generatedBy(sourceCode, node) {
  if (node.type === 'NewExpression') {
    return isClockRead(sourceCode, node) ? 'new Date' : undefined;
  }
  return node.type === 'CallExpression' ? generatorName(sourceCode, node.callee) : undefined;
}

function isKeyAttribute(attribute) {
  return attributeNamed(attribute.parent, 'key') === attribute;
}

function inKeyAttribute(node) {
  const owner = ancestorsOf(node).find(({ type }) => type === 'JSXAttribute');
  return owner !== undefined && isKeyAttribute(owner);
}

function childNodesOf(node) {
  return Object.entries(node)
    .filter(([field]) => field !== 'parent')
    .flatMap(([, value]) => [value].flat())
    .filter((value) => typeof value?.type === 'string');
}

function firstGeneratorIn(sourceCode, root) {
  const pending = [root];
  for (const node of pending) {
    const call = generatedBy(sourceCode, node);
    if (call !== undefined) {
      return call;
    }
    pending.push(...(isFunctionNode(node) ? [] : childNodesOf(node)));
  }
  return undefined;
}

function generatedConstant(sourceCode, identifier) {
  const variable = variableNamed(sourceCode, identifier);
  const [definition] = variable?.defs ?? [];
  const inRender = variable?.scope.variableScope.type === 'function';
  const isConst = definition?.type === 'Variable' && definition.parent.kind === 'const';
  const init = isConst && inRender ? definition.node.init : undefined;
  return init ? firstGeneratorIn(sourceCode, init) : undefined;
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
        'Do not build a `key` from `{{call}}()`: it changes on every render and remounts the row. Use a stable id from the item (`key={todo.id}`) and generate ids when the item is created. If remounting on every render is intended, add an exception for this rule in nitpicker.config.json.',
    },
  },
  create(context) {
    function reportGenerated(node) {
      const call = generatedBy(context.sourceCode, node);
      if (call !== undefined && inKeyAttribute(node)) {
        context.report({ node, messageId: 'randomKey', data: { call } });
      }
    }
    return {
      JSXAttribute(node) {
        const expression =
          node.value?.type === 'JSXExpressionContainer' ? node.value.expression : undefined;
        const call =
          isKeyAttribute(node) && expression?.type === 'Identifier'
            ? generatedConstant(context.sourceCode, expression)
            : undefined;
        if (call !== undefined) {
          context.report({ node: expression, messageId: 'randomKey', data: { call } });
        }
      },
      CallExpression: reportGenerated,
      NewExpression: reportGenerated,
    };
  },
};
