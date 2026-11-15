import type { ParserServicesWithTypeInformation, TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { ts } from '../typed/typescript-views.mts';

type Checker = TypeScript.TypeChecker;
type EffectiveHeritage = {
  readonly getEffectiveImplementsTypeNodes: (
    node: TypeScript.ClassDeclaration,
  ) => readonly TypeScript.ExpressionWithTypeArguments[] | undefined;
  readonly getEffectiveBaseTypeNode: (
    node: TypeScript.ClassDeclaration,
  ) => TypeScript.ExpressionWithTypeArguments | undefined;
};

function hasEffectiveHeritage(api: object): api is EffectiveHeritage {
  return (
    'getEffectiveImplementsTypeNodes' in api &&
    typeof api.getEffectiveImplementsTypeNodes === 'function' &&
    'getEffectiveBaseTypeNode' in api &&
    typeof api.getEffectiveBaseTypeNode === 'function'
  );
}

function effectiveHeritage(): EffectiveHeritage {
  if (!hasEffectiveHeritage(ts)) {
    throw new TypeError('The TypeScript API lacks the effective heritage helpers.');
  }
  return ts;
}

function sameType(checker: Checker, own: TypeScript.Node, target: TypeScript.Node): boolean {
  const left = checker.getTypeAtLocation(own);
  const right = checker.getTypeAtLocation(target);
  return (
    left === right ||
    (left.getCallSignatures().length > 0 &&
      checker.isTypeAssignableTo(left, right) &&
      checker.isTypeAssignableTo(right, left))
  );
}

function sameParameter(
  checker: Checker,
  own: TypeScript.ParameterDeclaration,
  target: TypeScript.ParameterDeclaration,
): boolean {
  return (
    sameType(checker, own, target) &&
    Boolean(own.questionToken) === Boolean(target.questionToken) &&
    Boolean(own.dotDotDotToken) === Boolean(target.dotDotDotToken)
  );
}

function returnTypeOf(
  checker: Checker,
  declaration: TypeScript.SignatureDeclaration,
): TypeScript.Type | undefined {
  const signature = checker.getSignatureFromDeclaration(declaration);
  return signature === undefined ? undefined : checker.getReturnTypeOfSignature(signature);
}

export function hasSameSignature(
  checker: Checker,
  own: TypeScript.MethodDeclaration,
  target: TypeScript.MethodDeclaration,
): boolean {
  const ownReturn = returnTypeOf(checker, own);
  return (
    !ts.isTypePredicateNode(own.type ?? target) &&
    !ts.isTypePredicateNode(target.type ?? own) &&
    own.typeParameters === undefined &&
    target.typeParameters === undefined &&
    own.parameters.length === target.parameters.length &&
    own.parameters.every((parameter, index) => {
      const other = target.parameters[index];
      return other !== undefined && sameParameter(checker, parameter, other);
    }) &&
    ownReturn !== undefined &&
    ownReturn === returnTypeOf(checker, target)
  );
}

export function isAsync(declaration: TypeScript.Declaration): boolean {
  return (ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.Async) !== 0;
}

export function isVoidResult(checker: Checker, declaration: TypeScript.MethodDeclaration): boolean {
  const type = returnTypeOf(checker, declaration);
  const text = type === undefined ? undefined : checker.typeToString(type);
  return text === 'void' || text === 'Promise<void>';
}

export function targetDeclaration(
  services: ParserServicesWithTypeInformation,
  property: TSESTree.Node,
  tsClass: TypeScript.ClassDeclaration,
): TypeScript.MethodDeclaration | undefined {
  const symbol = services.getSymbolAtLocation(property);
  const declarations = symbol?.declarations ?? [];
  const [declaration] = declarations;
  return declarations.length === 1 &&
    declaration !== undefined &&
    ts.isMethodDeclaration(declaration) &&
    declaration.parent === tsClass &&
    (ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.Abstract) === 0
    ? declaration
    : undefined;
}

function isMerged(checker: Checker, tsClass: TypeScript.ClassDeclaration, name: string): boolean {
  const property = checker.getTypeAtLocation(tsClass).getProperty(name);
  return (property?.declarations ?? []).some((declaration) => declaration.parent !== tsClass);
}

export function inheritsMember(
  checker: Checker,
  tsClass: TypeScript.ClassDeclaration,
  name: string,
): boolean {
  const heritage = tsClass.heritageClauses ?? [];
  if (heritage.length === 0) {
    return isMerged(checker, tsClass, name);
  }
  const own = checker.getTypeAtLocation(tsClass);
  const extended = own.isClassOrInterface() ? checker.getBaseTypes(own) : [];
  const implemented = (effectiveHeritage().getEffectiveImplementsTypeNodes(tsClass) ?? []).map(
    (node) => checker.getTypeFromTypeNode(node),
  );
  const unresolved =
    (effectiveHeritage().getEffectiveBaseTypeNode(tsClass) !== undefined &&
      extended.length === 0) ||
    implemented.some((type) => (type.flags & ts.TypeFlags.Any) !== 0);
  return (
    unresolved ||
    isMerged(checker, tsClass, name) ||
    [...extended, ...implemented].some((type) => type.getProperty(name) !== undefined)
  );
}

export function visibilityOf(declaration: TypeScript.MethodDeclaration): number {
  const flags = ts.getCombinedModifierFlags(declaration);
  if (ts.isPrivateIdentifier(declaration.name) || (flags & ts.ModifierFlags.Private) !== 0) {
    return 2;
  }
  return (flags & ts.ModifierFlags.Protected) === 0 ? 0 : 1;
}
