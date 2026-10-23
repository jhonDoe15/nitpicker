const ARRAY_MUTATORS = new Set([
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse',
  'fill',
  'copyWithin',
]);
const TYPED_ARRAY_MUTATORS = new Set(['set', 'sort', 'reverse', 'fill', 'copyWithin']);
const OWNER_MUTATORS = new Map([
  ['Array', ARRAY_MUTATORS],
  ['Set', new Set(['add', 'delete', 'clear'])],
  ['WeakSet', new Set(['add', 'delete'])],
  ['Map', new Set(['set', 'delete', 'clear'])],
  ['WeakMap', new Set(['set', 'delete'])],
  ['URLSearchParams', new Set(['append', 'delete', 'set', 'sort'])],
]);
const TYPED_ARRAY =
  /^(Int8|Uint8|Uint8Clamped|Int16|Uint16|Int32|Uint32|Float16|Float32|Float64|BigInt64|BigUint64)Array$/;
const DATE_SETTER =
  /^set(UTC)?(FullYear|Month|Date|Hours|Minutes|Seconds|Milliseconds)$|^set(Time|Year)$/;
const BUFFER_WRITER = /^(write|swap)/;
const INDIRECT_CALLS = new Set(['call', 'apply', 'bind']);

function mutates(owner, method) {
  if (owner === 'Date') {
    return DATE_SETTER.test(method);
  }
  if (owner === 'Buffer') {
    return BUFFER_WRITER.test(method);
  }
  if (TYPED_ARRAY.test(owner)) {
    return TYPED_ARRAY_MUTATORS.has(method);
  }
  return OWNER_MUTATORS.get(owner)?.has(method) === true;
}

function staticName(node, services) {
  if (!node.computed) {
    return node.property.type === 'Identifier' ? node.property.name : undefined;
  }
  const type = services.getTypeAtLocation(node.property);
  return type.isStringLiteral() ? type.value : undefined;
}

function partsOf(type) {
  return type.isUnion() || type.isIntersection() ? type.types : [type];
}

function ownersOf(property) {
  return (property?.declarations ?? [])
    .map((declaration) => declaration.parent?.name?.text)
    .filter((name) => name !== undefined);
}

function mutatedOwner(node, method, services) {
  const checker = services.program.getTypeChecker();
  const receiver = services.getTypeAtLocation(node.object);
  return partsOf(receiver)
    .flatMap((part) => ownersOf(checker.getApparentType(part).getProperty(method)))
    .find((owner) => mutates(owner, method));
}

function isPlainCallee(node) {
  return !node.computed && node.parent.type === 'CallExpression' && node.parent.callee === node;
}

function isReportedBySyntax(node, method) {
  if (!ARRAY_MUTATORS.has(method) || node.computed) {
    return false;
  }
  if (isPlainCallee(node)) {
    return true;
  }
  const outer = node.parent;
  return (
    outer.type === 'MemberExpression' &&
    outer.object === node &&
    INDIRECT_CALLS.has(outer.property.name) &&
    isPlainCallee(outer)
  );
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow mutating methods of arrays, Set, Map, Date, typed arrays, Buffer and URLSearchParams in domain code',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      mutatingMethod:
        'domain/ code does not mutate values, and {{owner}}.{{method}} changes the value it is called on: build a new value instead, e.g. new Set([...set, x]), new Map([...map, [key, value]]), new Map(xs.map((x) => [x.id, x] as const)) or new Date(ms + delta).',
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
      MemberExpression(node) {
        const method = staticName(node, services);
        if (method === undefined || isReportedBySyntax(node, method)) {
          return;
        }
        const owner = mutatedOwner(node, method, services);
        if (owner !== undefined) {
          context.report({ node, messageId: 'mutatingMethod', data: { owner, method } });
        }
      },
    };
  },
};
