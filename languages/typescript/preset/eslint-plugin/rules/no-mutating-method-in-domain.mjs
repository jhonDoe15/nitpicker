const COLLECTION_MUTATORS = new Map([
  ['Set', new Set(['add', 'delete', 'clear'])],
  ['WeakSet', new Set(['add', 'delete'])],
  ['Map', new Set(['set', 'delete', 'clear'])],
  ['WeakMap', new Set(['set', 'delete'])],
]);
const TYPED_ARRAY =
  /^(Int8|Uint8|Uint8Clamped|Int16|Uint16|Int32|Uint32|Float16|Float32|Float64|BigInt64|BigUint64)Array$/;
const TYPED_ARRAY_MUTATORS = new Set(['set', 'fill', 'sort', 'reverse', 'copyWithin']);
const DATE_SETTER =
  /^set(UTC)?(FullYear|Month|Date|Hours|Minutes|Seconds|Milliseconds)$|^set(Time|Year)$/;

const INDIRECT_CALLS = new Set(['call', 'apply', 'bind']);

function mutatingAccess(callee) {
  const method = methodName(callee);
  if (INDIRECT_CALLS.has(method) && callee.object.type === 'MemberExpression') {
    return { receiver: callee.object.object, method: methodName(callee.object) };
  }
  return { receiver: callee.object, method };
}

function methodName(callee) {
  if (callee.type !== 'MemberExpression') {
    return undefined;
  }
  return callee.computed ? callee.property.value : callee.property.name;
}

function typeNames(type) {
  const parts = type.isUnion() || type.isIntersection() ? type.types : [type];
  return parts.map((part) => part.getSymbol()?.getName()).filter((name) => name !== undefined);
}

function mutates(typeName, method) {
  if (typeName === 'Date') {
    return DATE_SETTER.test(method);
  }
  if (TYPED_ARRAY.test(typeName)) {
    return TYPED_ARRAY_MUTATORS.has(method);
  }
  return COLLECTION_MUTATORS.get(typeName)?.has(method) === true;
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow mutating Set, Map, Date and typed array methods in domain code',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      mutatingMethod:
        'domain/ code does not mutate a {{type}}: build a new value instead (new Set([...set, x]), new Map([...map, [k, v]]), new Date(ms) from a computed time). If this mutation is intended, add an exception for this rule in nitpicker.config.json.',
    },
  },
  create(context) {
    const services = context.sourceCode.parserServices;
    if (services?.program === undefined || services.program === null) {
      throw new Error(
        'no-mutating-method-in-domain needs type information (parserOptions.projectService)',
      );
    }
    return {
      CallExpression(node) {
        if (node.callee.type !== 'MemberExpression') {
          return;
        }
        const { receiver, method } = mutatingAccess(node.callee);
        if (typeof method !== 'string') {
          return;
        }
        const type = services.getTypeAtLocation(receiver);
        const mutated = typeNames(type).find((name) => mutates(name, method));
        if (mutated !== undefined) {
          context.report({ node, messageId: 'mutatingMethod', data: { type: mutated } });
        }
      },
    };
  },
};
