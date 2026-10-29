import { ts } from '../../../typescript-api/typescript-api.mjs';

const MEMBER_KINDS = [
  ts.SyntaxKind.PropertySignature,
  ts.SyntaxKind.MethodSignature,
  ts.SyntaxKind.PropertyDeclaration,
];

function typeParts({ checker, type }) {
  const apparent = checker.getApparentType(checker.getNonNullableType(type));
  return apparent.isUnion() ? apparent.types : [apparent];
}

function ownedDeclaration(symbol, owned) {
  return symbol.declarations?.find(
    (declaration) =>
      MEMBER_KINDS.includes(declaration.kind) && owned.has(declaration.getSourceFile().fileName),
  );
}

/**
 * The members a type declares in the project's own files: library members (HTML attributes, DOM
 * types, `children` from `PropsWithChildren`) have no declaration there and are left out.
 */
export function ownedMembers({ checker, type, owned }) {
  const entries = typeParts({ checker, type })
    .flatMap((part) => part.getProperties())
    .flatMap((symbol) => {
      const declaration = ownedDeclaration(symbol, owned);
      return declaration === undefined ? [] : [[symbol.name, declaration]];
    });
  return new Map(entries.toReversed());
}
