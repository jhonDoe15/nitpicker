import { ts } from '../../../../../typescript-api/typescript-api.mjs';

const ANONYMOUS = new Set(['__type', '__object']);
const NOT_DATA = ts.SymbolFlags.Class | ts.SymbolFlags.Enum | ts.SymbolFlags.Function;

export function isProjectFile(program, sourceFile) {
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
  const pending = [type];
  for (const current of pending) {
    const target = current.target ?? current;
    if (target.isClassOrInterface?.() === true) {
      pending.push(...scope.checker.getBaseTypes(target));
    }
  }
  return pending
    .slice(1)
    .every((base) => !isInstance(base) && declaredInProject(scope.program, base.getSymbol()));
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

function resolved(checker, type) {
  return type.isTypeParameter() ? checker.getBaseConstraintOfType(type) : type;
}

function partsOf(type, combined) {
  return combined ? type.types : [type];
}

function isCallerPart(scope, type, property) {
  const symbol = type?.getSymbol();
  if (
    symbol === undefined ||
    isInstance(type) ||
    type.isUnionOrIntersection() ||
    (symbol.flags & NOT_DATA) !== 0 ||
    type.getCallSignatures().length > 0 ||
    type.getConstructSignatures().length > 0
  ) {
    return false;
  }
  return ANONYMOUS.has(symbol.getName())
    ? isAnonymousProjectShape(scope, type, property)
    : isNamedProjectShape(scope, type);
}

export function isCallerObject(services, node, property) {
  const { program } = services;
  const checker = program.getTypeChecker();
  const scope = { program, checker };
  const type = resolved(checker, checker.getNonNullableType(services.getTypeAtLocation(node)));
  if (type === undefined) {
    return false;
  }
  return partsOf(type, type.isUnion()).every((alternative) => {
    const choice = resolved(checker, alternative);
    return (
      choice !== undefined &&
      partsOf(choice, choice.isIntersection()).every((part) =>
        isCallerPart(scope, resolved(checker, part), property),
      )
    );
  });
}
