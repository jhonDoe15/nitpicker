const MODULE = 'node:test';
const EXPORTED_NAME = 'test';

function isDefaultImport(definition) {
  return (
    definition.type === 'ImportBinding' &&
    definition.node.type === 'ImportDefaultSpecifier' &&
    definition.parent.source.value === MODULE
  );
}

function isWholeRequire(definition) {
  const init = definition.type === 'Variable' ? definition.node.init : undefined;
  return (
    init?.type === 'CallExpression' &&
    init.callee.type === 'Identifier' &&
    init.callee.name === 'require' &&
    init.arguments[0]?.value === MODULE &&
    definition.node.id.type === 'Identifier'
  );
}

function asNamedImport(definition) {
  const specifier = {
    type: 'ImportSpecifier',
    imported: { type: 'Identifier', name: EXPORTED_NAME },
    local: definition.node.local,
  };
  return Object.create(definition, { node: { value: specifier } });
}

function asDestructuredRequire(definition) {
  const parent = { type: 'Property', key: { type: 'Identifier', name: EXPORTED_NAME } };
  const name = Object.create(definition.name, { parent: { value: parent } });
  return Object.create(definition, { name: { value: name } });
}

function normalizedDefinition(definition) {
  if (isDefaultImport(definition)) return asNamedImport(definition);
  return isWholeRequire(definition) ? asDestructuredRequire(definition) : definition;
}

function normalizedVariable(variable) {
  if (variable === undefined) return variable;
  return Object.create(variable, { defs: { value: variable.defs.map(normalizedDefinition) } });
}

function normalizedScope(scope) {
  if (scope === null) return scope;
  const set = Object.create(scope.set, {
    get: { value: (name) => normalizedVariable(scope.set.get(name)) },
  });
  return Object.create(scope, {
    set: { value: set },
    upper: { get: () => normalizedScope(scope.upper) },
  });
}

function normalizedSourceCode(sourceCode) {
  return Object.create(sourceCode, {
    getScope: { value: (node) => normalizedScope(sourceCode.getScope(node)) },
  });
}

function normalizedContext(context) {
  return Object.create(context, {
    sourceCode: { value: normalizedSourceCode(context.sourceCode) },
  });
}

function withNodeTestImports(rule) {
  return { ...rule, create: (context) => rule.create(normalizedContext(context)) };
}

export function nodeTestPlugin(jestPlugin, ruleNames) {
  return {
    rules: Object.fromEntries(
      ruleNames.map((name) => [name, withNodeTestImports(jestPlugin.rules[name])]),
    ),
  };
}
