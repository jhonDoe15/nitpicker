import type TypeScript from 'typescript';
import { typescriptApi } from '../../../adapters/typed/typescript-program.mts';

const ts = typescriptApi();

const MEMBER_KINDS = [
  ts.SyntaxKind.PropertySignature,
  ts.SyntaxKind.MethodSignature,
  ts.SyntaxKind.PropertyDeclaration,
];

function typeParts({
  checker,
  type,
}: {
  readonly checker: TypeScript.TypeChecker;
  readonly type: TypeScript.Type;
}): TypeScript.Type[] {
  const apparent = checker.getApparentType(checker.getNonNullableType(type));
  return apparent.isUnion() ? apparent.types : [apparent];
}

function ownedDeclaration(
  symbol: TypeScript.Symbol,
  owned: ReadonlyMap<string, unknown>,
): TypeScript.Declaration | undefined {
  return symbol.declarations?.find(
    (declaration) =>
      MEMBER_KINDS.includes(declaration.kind) && owned.has(declaration.getSourceFile().fileName),
  );
}

function comesFirst(left: TypeScript.Declaration, right: TypeScript.Declaration): boolean {
  const leftFile = left.getSourceFile().fileName;
  const rightFile = right.getSourceFile().fileName;
  return leftFile === rightFile ? left.getStart() < right.getStart() : leftFile < rightFile;
}

export function ownedMembers({
  checker,
  type,
  owned,
}: {
  readonly checker: TypeScript.TypeChecker;
  readonly type: TypeScript.Type;
  readonly owned: ReadonlyMap<string, unknown>;
}): Map<string, TypeScript.Declaration> {
  const members = new Map<string, TypeScript.Declaration>();
  for (const symbol of typeParts({ checker, type }).flatMap((part) => part.getProperties())) {
    const declaration = ownedDeclaration(symbol, owned);
    const known = members.get(symbol.name);
    if (declaration !== undefined && (known === undefined || comesFirst(declaration, known))) {
      members.set(symbol.name, declaration);
    }
  }
  return members;
}
