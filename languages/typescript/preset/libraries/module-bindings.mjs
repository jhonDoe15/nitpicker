export function variableOf(sourceCode, identifier) {
  const scopes = [sourceCode.getScope(identifier)];
  for (const scope of scopes) {
    const variable = scope.set.get(identifier.name);
    if (variable !== undefined) {
      return variable;
    }
    if (scope.upper !== null) {
      scopes.push(scope.upper);
    }
  }
  return undefined;
}

export function isFromPackages(source, packages) {
  return (
    typeof source === 'string' &&
    packages.some((name) => source === name || source.startsWith(`${name}/`))
  );
}

function requireSource(init) {
  const call = init?.type === 'AwaitExpression' ? init.argument : init;
  return call?.type === 'CallExpression' &&
    call.callee.type === 'Identifier' &&
    call.callee.name === 'require' &&
    call.arguments[0]?.type === 'Literal'
    ? call.arguments[0].value
    : undefined;
}

function propertyName(property) {
  if (property === undefined) {
    return undefined;
  }
  return property.key.type === 'Identifier' ? property.key.name : property.key.value;
}

function destructuredProperty(pattern, definitionName) {
  return pattern.properties
    .filter((property) => property.type === 'Property')
    .find(
      (property) => property.value === definitionName || property.value.left === definitionName,
    );
}

function bindingOfDefinition(definition) {
  if (definition.type === 'ImportBinding') {
    const { node, parent } = definition;
    if (parent.type === 'TSImportEqualsDeclaration') {
      return { source: parent.moduleReference.expression?.value, name: undefined };
    }
    return {
      source: parent.source.value,
      name: node.type === 'ImportSpecifier' ? node.imported.name : undefined,
    };
  }
  if (definition.type !== 'Variable') {
    return undefined;
  }
  const source = requireSource(definition.node.init);
  if (source === undefined) {
    return undefined;
  }
  const property =
    definition.node.id.type === 'ObjectPattern'
      ? destructuredProperty(definition.node.id, definition.name)
      : undefined;
  return { source, name: propertyName(property) };
}

export function libraryBinding(variable, packages) {
  return (variable?.defs ?? [])
    .map((definition) => bindingOfDefinition(definition))
    .find((binding) => binding !== undefined && isFromPackages(binding.source, packages));
}

export function initializer(variable) {
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  return definition?.type === 'Variable' && definition.node.id.type === 'Identifier'
    ? definition.node.init
    : undefined;
}

export function destructuring(variable) {
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  if (
    definition?.type !== 'Variable' ||
    definition.node.id.type !== 'ObjectPattern' ||
    definition.node.init === null ||
    requireSource(definition.node.init) !== undefined
  ) {
    return undefined;
  }
  const method = propertyName(destructuredProperty(definition.node.id, definition.name));
  return method === undefined ? undefined : { receiver: definition.node.init, method };
}

export function isUnresolved(variable) {
  return (variable?.defs ?? []).every(
    (definition) => definition.type === 'Parameter' || definition.type === 'ImportBinding',
  );
}
