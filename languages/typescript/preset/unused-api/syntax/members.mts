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

export function ownedMembers({
  checker,
  type,
  owned,
}: {
  readonly checker: TypeScript.TypeChecker;
  readonly type: TypeScript.Type;
  readonly owned: ReadonlyMap<string, unknown>;
}): Map<string, TypeScript.Declaration> {
  const entries = typeParts({ checker, type })
    .flatMap((part) => part.getProperties())
    .flatMap((symbol): [string, TypeScript.Declaration][] => {
      const declaration = ownedDeclaration(symbol, owned);
      return declaration === undefined ? [] : [[symbol.name, declaration]];
    });
  return new Map(entries.toReversed());
}
