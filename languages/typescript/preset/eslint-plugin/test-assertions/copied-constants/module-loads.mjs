const ACTUAL_LOADS = new Set(['requireActual', 'importActual']);

function specifierOf(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  return node?.type === 'TemplateLiteral' && node.expressions.length === 0
    ? node.quasis[0].value.cooked
    : undefined;
}

function isLoadCall(callee) {
  if (callee.type === 'Identifier') {
    return callee.name === 'require';
  }
  return (
    callee.type === 'MemberExpression' &&
    callee.property.type === 'Identifier' &&
    ACTUAL_LOADS.has(callee.property.name)
  );
}

function keyName(key) {
  return key.type === 'Identifier' ? key.name : key.value;
}

function boundNames(load) {
  const holder = load.parent?.type === 'AwaitExpression' ? load.parent : load;
  const { parent } = holder;
  if (parent?.type !== 'VariableDeclarator' || parent.init !== holder) {
    return new Map();
  }
  if (parent.id.type !== 'ObjectPattern') {
    return new Map();
  }
  const names = new Map();
  for (const property of parent.id.properties) {
    const local = property.type === 'Property' ? property.value : undefined;
    const bound = local?.type === 'AssignmentPattern' ? local.left : local;
    if (bound?.type === 'Identifier' && !property.computed) {
      const name = keyName(property.key);
      names.set(name, [...(names.get(name) ?? []), bound.name]);
    }
  }
  return names;
}

function boundLoad(specifier, names) {
  return { specifier, names, whole: names.size === 0 };
}

/** The module a `require()`, `import()` or test-runner `requireActual`/`importActual` call loads. */
export function loadedModule(node) {
  if (node.type === 'ImportExpression') {
    const specifier = specifierOf(node.source);
    return specifier === undefined ? undefined : boundLoad(specifier, boundNames(node));
  }
  if (node.type === 'TSImportEqualsDeclaration') {
    const reference = node.moduleReference;
    const specifier =
      reference.type === 'TSExternalModuleReference' && node.importKind !== 'type'
        ? specifierOf(reference.expression)
        : undefined;
    return specifier === undefined ? undefined : { specifier, names: new Map(), whole: true };
  }
  const specifier = isLoadCall(node.callee) ? specifierOf(node.arguments[0]) : undefined;
  return specifier === undefined ? undefined : boundLoad(specifier, boundNames(node));
}

/** The value imports of a module: the specifier with the local names each imported name has. */
export function importedModule(statement) {
  const names = new Map();
  let whole = statement.specifiers.length === 0;
  for (const specifier of statement.specifiers) {
    if (specifier.type === 'ImportNamespaceSpecifier') {
      whole = true;
    } else if (specifier.type === 'ImportDefaultSpecifier') {
      names.set('default', [specifier.local.name]);
    } else if (specifier.importKind !== 'type') {
      const imported = specifier.imported.name ?? specifier.imported.value;
      names.set(imported, [...(names.get(imported) ?? []), specifier.local.name]);
    }
  }
  return { specifier: statement.source.value, names, whole };
}
