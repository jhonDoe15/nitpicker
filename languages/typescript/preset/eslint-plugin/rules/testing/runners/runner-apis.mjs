const GLOBAL_KINDS = [
  ['vi', 'vitest'],
  ['vitest', 'vitest'],
  ['jest', 'jest'],
];

const IMPORTS = [
  { matches: (source) => source === 'vitest', names: ['vi', 'vitest'], kind: 'vitest' },
  { matches: (source) => source === '@jest/globals', names: ['jest'], kind: 'jest' },
  { matches: (source) => source === 'node:test', names: ['mock'], kind: 'node' },
  {
    matches: (source) => source.startsWith('@testing-library/'),
    names: ['waitFor'],
    kind: 'waitFor',
  },
  { matches: (source) => source === 'mock-require', names: ['default'], kind: 'mockRequire' },
  { matches: (source) => source === 'testdouble', names: ['default'], kind: 'testdouble' },
  { matches: (source) => source === 'quibble', names: ['default'], kind: 'quibble' },
];

const MODULE_MOCKS = {
  vitest: ['mock', 'doMock'],
  jest: ['mock', 'doMock', 'unstable_mockModule', 'setMock'],
  node: ['module'],
  testdouble: ['replace'],
  quibble: ['esm'],
};

const DIRECT_MODULE_MOCKS = new Set(['mockRequire', 'quibble']);

const FAKE_TIMERS_ON = { vitest: ['useFakeTimers'], jest: ['useFakeTimers'], node: ['enable'] };

const FAKE_TIMERS_OFF = { vitest: ['useRealTimers'], jest: ['useRealTimers'], node: ['reset'] };

function importedName(specifier) {
  if (specifier.type === 'ImportDefaultSpecifier') {
    return 'default';
  }
  if (specifier.type !== 'ImportSpecifier') {
    return undefined;
  }
  const { imported } = specifier;
  return imported.type === 'Identifier' ? imported.name : imported.value;
}

function importBindings(node, spec) {
  return node.specifiers
    .map((specifier) => ({ name: importedName(specifier), local: specifier.local.name }))
    .filter(({ name }) => spec.names.includes(name))
    .map(({ local }) => ({ local, kind: spec.kind }));
}

function requireSource(init) {
  const isRequire =
    init?.type === 'CallExpression' &&
    init.callee.type === 'Identifier' &&
    init.callee.name === 'require' &&
    typeof init.arguments[0]?.value === 'string';
  return isRequire ? init.arguments[0].value : undefined;
}

function destructuredBindings(pattern, spec) {
  return pattern.properties
    .filter(
      (property) =>
        property.type === 'Property' &&
        property.key.type === 'Identifier' &&
        property.value.type === 'Identifier' &&
        spec.names.includes(property.key.name),
    )
    .map((property) => ({ local: property.value.name, kind: spec.kind }));
}

function requireBindings(declarator, spec) {
  const { id } = declarator;
  if (id.type === 'ObjectPattern') {
    return destructuredBindings(id, spec);
  }
  return id.type === 'Identifier' && spec.names.includes('default')
    ? [{ local: id.name, kind: spec.kind }]
    : [];
}

function specFor(source) {
  return source === undefined ? undefined : IMPORTS.find(({ matches }) => matches(source));
}

export function createRunnerApis() {
  return { kinds: new Map(GLOBAL_KINDS) };
}

function remember(apis, bindings) {
  for (const { local, kind } of bindings) {
    apis.kinds.set(local, kind);
  }
}

export function runnerApiVisitors(apis) {
  return {
    ImportDeclaration(node) {
      const spec = specFor(node.source.value);
      if (spec !== undefined && node.importKind !== 'type') {
        remember(apis, importBindings(node, spec));
      }
    },
    VariableDeclarator(node) {
      const spec = specFor(requireSource(node.init));
      if (spec !== undefined) {
        remember(apis, requireBindings(node, spec));
      }
    },
  };
}

function propertyName(callee) {
  const named = callee.type === 'MemberExpression' && !callee.computed;
  return named && callee.property.type === 'Identifier' ? callee.property.name : undefined;
}

function kindOfObject(apis, node) {
  if (node.type === 'Identifier') {
    return apis.kinds.get(node.name);
  }
  return propertyName(node) === 'mock' ? 'node' : undefined;
}

export function moduleMockSource(apis, call) {
  const { callee } = call;
  if (callee.type === 'Identifier') {
    return DIRECT_MODULE_MOCKS.has(apis.kinds.get(callee.name)) ? call.arguments[0] : undefined;
  }
  const method = propertyName(callee);
  const kind = method === undefined ? undefined : kindOfObject(apis, callee.object);
  return MODULE_MOCKS[kind]?.includes(method) ? call.arguments[0] : undefined;
}

function nodeTimerMethod(apis, callee) {
  const method = propertyName(callee);
  const timers = callee.type === 'MemberExpression' ? callee.object : undefined;
  const isTimers = timers !== undefined && propertyName(timers) === 'timers';
  return isTimers && kindOfObject(apis, timers.object) === 'node' ? method : undefined;
}

function fakeFlag(kind, method) {
  if (FAKE_TIMERS_ON[kind]?.includes(method)) {
    return true;
  }
  return FAKE_TIMERS_OFF[kind]?.includes(method) ? false : undefined;
}

export function fakeTimerChange(apis, call) {
  const { callee } = call;
  if (callee.type !== 'MemberExpression') {
    return undefined;
  }
  const nodeMethod = nodeTimerMethod(apis, callee);
  const kind = nodeMethod === undefined ? kindOfObject(apis, callee.object) : 'node';
  const fake = fakeFlag(kind, nodeMethod ?? propertyName(callee));
  return fake === undefined ? undefined : { kind, fake };
}

export function waitKind(apis, call) {
  const { callee } = call;
  if (callee.type === 'Identifier') {
    return apis.kinds.get(callee.name) === 'waitFor' ? 'testing-library' : undefined;
  }
  const isVitestWait =
    propertyName(callee) === 'waitFor' && kindOfObject(apis, callee.object) === 'vitest';
  return isVitestWait ? 'vitest' : undefined;
}
