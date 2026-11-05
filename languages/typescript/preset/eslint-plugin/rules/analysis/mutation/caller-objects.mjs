const ANONYMOUS = new Set(['__type', '__object']);

function isProjectFile(program, sourceFile) {
  return (
    !program.isSourceFileFromExternalLibrary(sourceFile) &&
    !program.isSourceFileDefaultLibrary(sourceFile) &&
    !sourceFile.fileName.includes('/node_modules/')
  );
}

function declaredInProject(program, symbol) {
  const declarations = symbol?.declarations ?? [];
  return declarations.every((declaration) => isProjectFile(program, declaration.getSourceFile()));
}

function hasMutableIndex(checker, type) {
  return checker.getIndexInfosOfType(type).some((info) => !info.isReadonly);
}

function isInstance(type) {
  return (type.target ?? type).isClass?.() === true;
}

function hasOnlyProjectBases(scope, type) {
  const target = type.target ?? type;
  if (!target.isClassOrInterface?.()) {
    return true;
  }
  return scope.checker
    .getBaseTypes(target)
    .every((base) => !isInstance(base) && isNamedProjectShape(scope, base));
}

function isNamedProjectShape(scope, type) {
  return declaredInProject(scope.program, type.getSymbol()) && hasOnlyProjectBases(scope, type);
}

function isAnonymousProjectShape(scope, type, property) {
  const symbol = type.getSymbol();
  if (declaredInProject(scope.program, symbol)) {
    return true;
  }
  const properties = property === undefined ? type.getProperties() : [type.getProperty(property)];
  const known = properties.filter((member) => member !== undefined);
  const projectProperties =
    known.length > 0 && known.every((member) => declaredInProject(scope.program, member));
  return projectProperties || hasMutableIndex(scope.checker, type);
}

function isCallerShape(scope, type, property) {
  if (type.isTypeParameter()) {
    const constraint = scope.checker.getBaseConstraintOfType(type);
    return constraint !== undefined && isCallerShape(scope, constraint, property);
  }
  if (type.isUnion()) {
    return type.types.some((part) => isCallerShape(scope, part, property));
  }
  if (type.isIntersection()) {
    return type.types.every((part) => isCallerShape(scope, part, property));
  }
  const symbol = type.getSymbol();
  if (symbol === undefined || isInstance(type)) {
    return false;
  }
  return ANONYMOUS.has(symbol.getName())
    ? isAnonymousProjectShape(scope, type, property)
    : isNamedProjectShape(scope, type);
}

export function isCallerObject(services, node, property) {
  const { program } = services;
  const checker = program.getTypeChecker();
  const type = checker.getNonNullableType(services.getTypeAtLocation(node));
  return isCallerShape({ program, checker }, type, property);
}
