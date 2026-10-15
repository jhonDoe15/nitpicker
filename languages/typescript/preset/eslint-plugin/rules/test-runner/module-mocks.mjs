const MOCK_OBJECT_MODULES = new Map([
  ['vitest', ['vi', 'vitest']],
  ['@jest/globals', ['jest']],
]);
const MOCK_OBJECT_METHODS = new Set(['mock', 'doMock', 'unstable_mockModule', 'setMock']);
const GLOBAL_MOCK_OBJECTS = ['vi', 'vitest', 'jest'];
const NODE_TEST_MODULE = 'node:test';

export function createMockAliases() {
  return { objects: new Set(GLOBAL_MOCK_OBJECTS), nodeMocks: new Set() };
}

export function recordMockImport(node, aliases) {
  const source = node.source.value;
  const names = MOCK_OBJECT_MODULES.get(source) ?? [];
  for (const specifier of node.specifiers) {
    if (specifier.type !== 'ImportSpecifier') continue;
    if (names.includes(specifier.imported.name)) aliases.objects.add(specifier.local.name);
    if (source === NODE_TEST_MODULE && specifier.imported.name === 'mock') {
      aliases.nodeMocks.add(specifier.local.name);
    }
  }
}

function isNodeModuleMock(callee, aliases) {
  if (callee.property.name !== 'module') return false;
  const owner = callee.object;
  if (owner.type === 'Identifier') return aliases.nodeMocks.has(owner.name);
  return owner.type === 'MemberExpression' && !owner.computed && owner.property.name === 'mock';
}

function isObjectModuleMock(callee, aliases) {
  return (
    callee.object.type === 'Identifier' &&
    aliases.objects.has(callee.object.name) &&
    MOCK_OBJECT_METHODS.has(callee.property.name)
  );
}

export function isModuleMockCall(node, aliases) {
  const callee = node.callee;
  if (callee.type !== 'MemberExpression' || callee.computed) return false;
  return isObjectModuleMock(callee, aliases) || isNodeModuleMock(callee, aliases);
}
