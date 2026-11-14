import { kindOfObject, propertyName } from './runner-apis.mjs';

const MODULE_MOCKS = {
  vitest: ['mock', 'doMock'],
  jest: ['mock', 'doMock', 'unstable_mockModule', 'setMock'],
  node: ['module'],
  testdouble: ['replace'],
  quibble: ['esm'],
};

const DIRECT_MODULE_MOCKS = new Set(['mockRequire', 'quibble']);

const LOADER_MOCKS = { proxyquire: ['load'], esmock: ['strict', 'strictest', 'partial', 'p'] };

const LOADER_MOCK_ARGUMENTS = { start: 1, end: 3 };

function mockedName(node) {
  const source = node?.type === 'ImportExpression' ? node.source : node;
  return source?.type === 'Literal' && typeof source.value === 'string' ? source.value : undefined;
}

function keyName(property) {
  if (property.type !== 'Property') {
    return undefined;
  }
  return property.key.type === 'Identifier' && !property.computed
    ? property.key.name
    : mockedName(property.key);
}

function loaderMocks(call) {
  const { start, end } = LOADER_MOCK_ARGUMENTS;
  return call.arguments
    .slice(start, end)
    .filter((argument) => argument.type === 'ObjectExpression')
    .flatMap((argument) => argument.properties)
    .map((property) => ({ name: keyName(property), replacement: property.value }));
}

function callKind(apis, callee) {
  if (callee.type === 'Identifier') {
    return { kind: apis.kinds.get(callee.name), direct: true };
  }
  const method = propertyName(callee);
  return { kind: method === undefined ? undefined : kindOfObject(apis, callee.object), method };
}

export function moduleMocks(apis, call) {
  const { kind, method, direct } = callKind(apis, call.callee);
  const loader = Object.hasOwn(LOADER_MOCKS, kind ?? '') ? LOADER_MOCKS[kind] : undefined;
  if (loader !== undefined && (direct === true || loader.includes(method))) {
    return loaderMocks(call);
  }
  const mocksModule =
    direct === true ? DIRECT_MODULE_MOCKS.has(kind) : MODULE_MOCKS[kind]?.includes(method);
  const [source, replacement] = mocksModule === true ? call.arguments : [];
  return source === undefined ? [] : [{ name: mockedName(source), source, replacement }];
}
