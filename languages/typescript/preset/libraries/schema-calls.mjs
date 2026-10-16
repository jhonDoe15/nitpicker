const MAX_NODES = 24;

function variableOf(sourceCode, identifier) {
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

function derivedParents(sourceCode, node, packages) {
  switch (node.type) {
    case 'Identifier': {
      const variable = variableOf(sourceCode, node);
      return importDefinition(variable, packages) === undefined ? [initializer(variable)] : true;
    }
    case 'MemberExpression':
      return [node.object];
    case 'CallExpression':
    case 'NewExpression':
      return [node.callee];
    case 'AwaitExpression':
      return [node.argument];
    default:
      return [];
  }
}

function isDerived(sourceCode, start, packages) {
  const pending = [start];
  for (const node of pending) {
    const parents =
      node === null || node === undefined || pending.length > MAX_NODES
        ? []
        : derivedParents(sourceCode, node, packages);
    if (parents === true) {
      return true;
    }
    pending.push(...parents);
  }
  return false;
}

function isImportedFunction(sourceCode, callee, { packages, names }) {
  const definition = importDefinition(variableOf(sourceCode, callee), packages);
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
        isImportedFunction(sourceCode, callee, {
          packages: library.packages,
          names: library.imported,
        }) || isCallableSchema(sourceCode, callee, library)
      );
    }
    return callee.type === 'MemberExpression' && isMethodParse(sourceCode, callee, library);
  });
}

function isTransformCall(sourceCode, call, libraries) {
  return (
    call.callee.type === 'Identifier' &&
    libraries.some((library) =>
      isImportedFunction(sourceCode, call.callee, {
        packages: library.packages,
        names: library.transform,
      }),
    )
  );
}

function flowTargets(sourceCode, expression, libraries) {
  const parent = expression.parent;
  if (parent.type === 'CallExpression' && parent.arguments.includes(expression)) {
    if (isParseCall(sourceCode, parent, libraries)) {
      return true;
    }
    return isTransformCall(sourceCode, parent, libraries) ? [parent] : [];
  }
  if (
    parent.type === 'VariableDeclarator' &&
    parent.init === expression &&
    parent.id.type === 'Identifier'
  ) {
    return sourceCode
      .getDeclaredVariables(parent)
      .flatMap((variable) => variable.references)
      .map((reference) => reference.identifier)
      .filter((identifier) => identifier !== parent.id);
  }
  return [];
}

export function isParsedBySchema(sourceCode, expression, libraries) {
  const pending = [expression];
  for (const node of pending) {
    if (pending.length > MAX_NODES) {
      return false;
    }
    const targets = flowTargets(sourceCode, node, libraries);
    if (targets === true) {
      return true;
    }
    pending.push(...targets);
  }
  return false;
}
