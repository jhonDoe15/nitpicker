import type { ParserServicesWithTypeInformation, TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { isType, ts } from '../../typed/typescript-views.mts';
import { appendAll } from '../../../../../../../shared/lists/lists.mts';

type Scope = { readonly program: TypeScript.Program; readonly checker: TypeScript.TypeChecker };

const ANONYMOUS = new Set(['__type', '__object']);
const NOT_DATA = ts.SymbolFlags.Class | ts.SymbolFlags.Enum | ts.SymbolFlags.Function;

export function isProjectFile(
  program: TypeScript.Program,
  sourceFile: TypeScript.SourceFile,
): boolean {
  return !(
    program.isSourceFileFromExternalLibrary(sourceFile) ||
    program.isSourceFileDefaultLibrary(sourceFile) ||
    sourceFile.fileName.includes('/node_modules/')
  );
}

function declaredInProject(
  program: TypeScript.Program,
  symbol: TypeScript.Symbol | undefined,
): boolean {
  const declarations = symbol?.declarations ?? [];
  return declarations.every((declaration) => isProjectFile(program, declaration.getSourceFile()));
}

function hasMutableIndex(checker: TypeScript.TypeChecker, type: TypeScript.Type): boolean {
  return checker.getIndexInfosOfType(type).some((info) => !info.isReadonly);
}

function targetOf(type: TypeScript.Type): TypeScript.Type {
  const target: unknown = Reflect.get(type, 'target');
  return isType(target) ? target : type;
}

function isInstance(type: TypeScript.Type): boolean {
  return targetOf(type).isClass();
}

function hasOnlyProjectBases(scope: Scope, type: TypeScript.Type): boolean {
  const pending = [type];
  for (const current of pending) {
    const target = targetOf(current);
    if (target.isClassOrInterface()) {
      appendAll(pending, scope.checker.getBaseTypes(target));
    }
  }
  return pending
    .slice(1)
    .every((base) => !isInstance(base) && declaredInProject(scope.program, base.getSymbol()));
}

function isNamedProjectShape(scope: Scope, type: TypeScript.Type): boolean {
  return declaredInProject(scope.program, type.getSymbol()) && hasOnlyProjectBases(scope, type);
}

function isAnonymousProjectShape(
  scope: Scope,
  type: TypeScript.Type,
  property: string | undefined,
): boolean {
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

function resolved(
  checker: TypeScript.TypeChecker,
  type: TypeScript.Type,
): TypeScript.Type | undefined {
  return type.isTypeParameter() ? checker.getBaseConstraintOfType(type) : type;
}

function partsOf(type: TypeScript.Type, combined: boolean): readonly TypeScript.Type[] {
  return combined && type.isUnionOrIntersection() ? type.types : [type];
}

function isCallerPart(
  scope: Scope,
  type: TypeScript.Type | undefined,
  property: string | undefined,
): boolean {
  const symbol = type?.getSymbol();
  if (
    type === undefined ||
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

export function isCallerObject(
  services: ParserServicesWithTypeInformation,
  node: TSESTree.Node,
  property: string | undefined,
): boolean {
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
