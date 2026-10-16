const MAX_DEPTH = 8;

function variableOf(sourceCode, identifier) {
  for (let scope = sourceCode.getScope(identifier); scope !== null; scope = scope.upper) {
    const variable = scope.set.get(identifier.name);
    if (variable !== undefined) {
      return variable;
    }
  }
  return undefined;
}

function isFromPackages(source, packages) {
  return (
    typeof source === 'string' &&
    packages.some((name) => source === name || source.startsWith(`${name}/`))
  );
}

function importDefinition(variable, packages) {
  return variable?.defs.find(
    (definition) =>
      definition.type === 'ImportBinding' &&
      isFromPackages(definition.parent.source.value, packages),
  );
}

function importedName(definition) {
  return definition.node.type === 'ImportSpecifier' ? definition.node.imported.name : undefined;
}

function initializer(variable) {
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  return definition?.type === 'Variable' && definition.node.id.type === 'Identifier'
    ? definition.node.init
    : undefined;
}

function isDerived(sourceCode, node, packages, depth = 0) {
  if (node === null || node === undefined || depth > MAX_DEPTH) {
    return false;
  }
  switch (node.type) {
    case 'Identifier': {
      const variable = variableOf(sourceCode, node);
      return (
        importDefinition(variable, packages) !== undefined ||
        isDerived(sourceCode, initializer(variable), packages, depth + 1)
      );
    }
    case 'MemberExpression':
      return isDerived(sourceCode, node.object, packages, depth + 1);
    case 'CallExpression':
    case 'NewExpression':
      return isDerived(sourceCode, node.callee, packages, depth + 1);
    case 'AwaitExpression':
      return isDerived(sourceCode, node.argument, packages, depth + 1);
    default:
      return false;
  }
}

function isImportedFunction(sourceCode, callee, library, names) {
  const definition = importDefinition(variableOf(sourceCode, callee), library.packages);
  return definition !== undefined && names.includes(importedName(definition));
}

function isCallableSchema(sourceCode, callee, library) {
  return (
    library.callable &&
    isDerived(sourceCode, initializer(variableOf(sourceCode, callee)), library.packages)
  );
}

function isMethodParse(sourceCode, callee, library) {
  if (callee.computed || callee.property.type !== 'Identifier') {
    return false;
  }
  const method = callee.property.name;
  return (
    library.anyReceiver.includes(method) ||
    (library.derivedReceiver.includes(method) &&
      isDerived(sourceCode, callee.object, library.packages)) ||
    (library.namespace.includes(method) &&
      callee.object.type === 'Identifier' &&
      importDefinition(variableOf(sourceCode, callee.object), library.packages) !== undefined)
  );
}

function isParseCall(sourceCode, call, libraries) {
  const { callee } = call;
  return libraries.some((library) => {
    if (callee.type === 'Identifier') {
      return (
        isImportedFunction(sourceCode, callee, library, library.imported) ||
        isCallableSchema(sourceCode, callee, library)
      );
    }
    return callee.type === 'MemberExpression' && isMethodParse(sourceCode, callee, library);
  });
}

function isTransformCall(sourceCode, call, libraries) {
  return (
    call.callee.type === 'Identifier' &&
    libraries.some((library) =>
      isImportedFunction(sourceCode, call.callee, library, library.transform),
    )
  );
}

function flowsIntoParse(sourceCode, expression, libraries, depth) {
  const parent = expression.parent;
  if (depth > MAX_DEPTH) {
    return false;
  }
  if (parent.type === 'CallExpression' && parent.arguments.includes(expression)) {
    return (
      isParseCall(sourceCode, parent, libraries) ||
      (isTransformCall(sourceCode, parent, libraries) &&
        flowsIntoParse(sourceCode, parent, libraries, depth + 1))
    );
  }
  if (
    parent.type === 'VariableDeclarator' &&
    parent.init === expression &&
    parent.id.type === 'Identifier'
  ) {
    return sourceCode
      .getDeclaredVariables(parent)
      .some((variable) =>
        variable.references.some(
          (reference) =>
            reference.identifier !== parent.id &&
            flowsIntoParse(sourceCode, reference.identifier, libraries, depth + 1),
        ),
      );
  }
  return false;
}

export function isParsedBySchema(sourceCode, expression, libraries) {
  return flowsIntoParse(sourceCode, expression, libraries, 0);
}
