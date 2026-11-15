import type TypeScript from 'typescript';
import { ts } from '../../syntax/typed.mts';
import { entryOfNodeOrType, isUntyped, normalizedTypeText } from '../../types/type-lookup.mts';
import type { Fact, Scope, Site, SiteNode, TypeEntry } from '../../design-types.mts';

export function parameterInfo(
  scope: Scope,
  parameter: TypeScript.ParameterDeclaration,
): { entry?: TypeEntry | undefined; text?: string | undefined } {
  const { checker } = scope;
  const typeNode = ts.getEffectiveTypeAnnotationNode(parameter);
  const infers = parameter.initializer !== undefined || scope.site.callback === true;
  if (typeNode === undefined && !infers) {
    return {};
  }
  const type =
    typeNode === undefined
      ? checker.getTypeAtLocation(parameter)
      : checker.getTypeFromTypeNode(typeNode);
  if (typeNode === undefined && isUntyped(checker, type)) {
    return {};
  }
  const entry = entryOfNodeOrType(scope, { typeNode, type });
  return { entry, text: entry?.id ?? normalizedTypeText(checker, type) };
}

function parameterName(parameter: TypeScript.ParameterDeclaration, index: number): string {
  return ts.isIdentifier(parameter.name) ? parameter.name.text : `arg${String(index)}`;
}

export function declaredParameters(node: SiteNode): TypeScript.ParameterDeclaration[] {
  return node.parameters.filter(
    (parameter) => !(ts.isIdentifier(parameter.name) && parameter.name.text === 'this'),
  );
}

export function acceptsPosition(site: Site, position: number): boolean {
  const parameters = declaredParameters(site.node);
  return position < parameters.length || parameters.at(-1)?.dotDotDotToken !== undefined;
}

export function paramFacts(scope: Scope, node: SiteNode): Fact[] {
  return declaredParameters(node).map((parameter, index) => {
    const { text: type } = parameterInfo(scope, parameter);
    const isOptional = parameter.questionToken !== undefined || parameter.initializer !== undefined;
    return {
      name: parameterName(parameter, index),
      ...(type === undefined ? {} : { type }),
      ...(parameter.dotDotDotToken === undefined ? {} : { variadic: true }),
      ...(isOptional ? { optional: true } : {}),
      ...(ts.isIdentifier(parameter.name) ? {} : { pattern: true }),
    };
  });
}

const KEYWORD_TYPES = new Set([
  ts.SyntaxKind.StringKeyword,
  ts.SyntaxKind.NumberKeyword,
  ts.SyntaxKind.BooleanKeyword,
  ts.SyntaxKind.VoidKeyword,
  ts.SyntaxKind.AnyKeyword,
  ts.SyntaxKind.UnknownKeyword,
  ts.SyntaxKind.NeverKeyword,
  ts.SyntaxKind.BigIntKeyword,
]);

export function declaredReturnType(scope: Scope, node: SiteNode): string | undefined {
  const { checker } = scope;
  const annotation = node.type ?? ts.getJSDocReturnType(node);
  if (annotation === undefined) {
    return undefined;
  }
  if (KEYWORD_TYPES.has(annotation.kind)) {
    return ts.tokenToString(annotation.kind);
  }
  const type = checker.getTypeFromTypeNode(annotation);
  const entry = entryOfNodeOrType(scope, { typeNode: annotation, type });
  return entry?.id ?? normalizedTypeText(checker, type);
}
