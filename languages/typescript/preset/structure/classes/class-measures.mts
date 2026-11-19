import type TypeScript from 'typescript';
import { typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import { depthFirst, syntaxChildren } from '../typed/analysis-views.mts';

const ts = typescriptApi();

export type ClassMeasure = {
  readonly file: string;
  readonly source: string;
  readonly name: string;
  readonly local: string | undefined;
  readonly start: number;
  readonly kind: 'class';
  readonly methods: number;
  readonly fields: number;
  readonly extends: string | undefined;
  readonly base: string | undefined;
};

type ClassNode = TypeScript.ClassDeclaration | TypeScript.ClassExpression;

function hasModifier(node: TypeScript.Node, kind: TypeScript.SyntaxKind): boolean {
  return (ts.canHaveModifiers(node) ? (ts.getModifiers(node) ?? []) : []).some(
    (modifier) => modifier.kind === kind,
  );
}

function isOverloadSignature(
  member: TypeScript.ClassElement,
  next: TypeScript.ClassElement | undefined,
) {
  return (
    ts.isMethodDeclaration(member) &&
    member.body === undefined &&
    !hasModifier(member, ts.SyntaxKind.AbstractKeyword) &&
    next !== undefined &&
    ts.isMethodDeclaration(next) &&
    next.name.getText() === member.name.getText()
  );
}

function countsAsMethod(
  member: TypeScript.ClassElement,
  next: TypeScript.ClassElement | undefined,
) {
  return (
    ts.isGetAccessorDeclaration(member) ||
    ts.isSetAccessorDeclaration(member) ||
    (ts.isMethodDeclaration(member) && !isOverloadSignature(member, next))
  );
}

function isParameterProperty(parameter: TypeScript.ParameterDeclaration): boolean {
  return (ts.getModifiers(parameter) ?? []).some(
    (modifier) =>
      modifier.kind === ts.SyntaxKind.PublicKeyword ||
      modifier.kind === ts.SyntaxKind.ProtectedKeyword ||
      modifier.kind === ts.SyntaxKind.PrivateKeyword ||
      modifier.kind === ts.SyntaxKind.ReadonlyKeyword ||
      modifier.kind === ts.SyntaxKind.OverrideKeyword,
  );
}

function instanceFields(members: readonly TypeScript.ClassElement[]): number {
  const declared = members.filter(
    (member) =>
      ts.isPropertyDeclaration(member) && !hasModifier(member, ts.SyntaxKind.StaticKeyword),
  );
  const constructors = members.filter(
    (member): member is TypeScript.ConstructorDeclaration =>
      ts.isConstructorDeclaration(member) && member.body !== undefined,
  );
  const parameterProperties = constructors.flatMap((member) =>
    member.parameters.filter((parameter) => isParameterProperty(parameter)),
  );
  return declared.length + parameterProperties.length;
}

function baseExpression(node: ClassNode): TypeScript.ExpressionWithTypeArguments | undefined {
  return node.heritageClauses
    ?.find((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword)
    ?.types.at(0);
}

function localName(node: ClassNode): string | undefined {
  if (node.name !== undefined) {
    return node.name.text;
  }
  const owner = node.parent;
  return ts.isVariableDeclaration(owner) && ts.isIdentifier(owner.name)
    ? owner.name.text
    : undefined;
}

const NAME_PATH = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/u;

function measure(
  node: ClassNode,
  [file, source]: readonly [string, string],
  sourceFile: TypeScript.SourceFile,
): ClassMeasure {
  const members = [...node.members];
  const local = localName(node);
  const base = baseExpression(node);
  return {
    file,
    source,
    name: local ?? '<anonymous>',
    local,
    start: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
    kind: 'class',
    methods: members.filter((member, index) => countsAsMethod(member, members[index + 1])).length,
    fields: instanceFields(members),
    extends: base?.getText(sourceFile),
    base:
      base !== undefined && NAME_PATH.test(base.expression.getText())
        ? base.expression.getText()
        : undefined,
  };
}

export function measureClasses(
  sourceFile: TypeScript.SourceFile,
  names: readonly [file: string, source: string],
): ClassMeasure[] {
  return [...depthFirst<TypeScript.Node>(sourceFile, syntaxChildren)]
    .filter((node) => ts.isClassDeclaration(node) || ts.isClassExpression(node))
    .map((node) => measure(node, names, sourceFile));
}
