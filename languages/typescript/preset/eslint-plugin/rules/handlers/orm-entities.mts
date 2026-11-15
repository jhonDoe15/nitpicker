import type TypeScript from 'typescript';
import { ts } from '../typed/typescript-views.mts';
import { decoratorNames } from '../contracts/decorators.mts';
import { packageOf } from '../contracts/infrastructure-types.mts';
import { findInType } from '../contracts/type-walk.mts';

export type Entity = { readonly name: string; readonly orm: string };

const DECORATOR_ORMS: readonly (readonly [string, string])[] = [
  ['typeorm', 'TypeORM'],
  ['@mikro-orm/*', 'MikroORM'],
];
const BASE_CLASS_ORMS: readonly (readonly [string, string, string])[] = [
  ['sequelize', 'Model', 'Sequelize'],
  ['mongoose', 'Document', 'Mongoose'],
];
const PRISMA = '@prisma/client';

function packageOfSymbol(symbol: TypeScript.Symbol | undefined): string | undefined {
  const declaration = symbol?.declarations?.[0];
  return declaration === undefined ? undefined : packageOf(declaration.getSourceFile().fileName);
}

function decoratedOrm(
  checker: TypeScript.TypeChecker,
  symbol: TypeScript.Symbol,
): string | undefined {
  const declarations = (symbol.declarations ?? []).filter((declaration) =>
    ts.isClassLike(declaration),
  );
  return DECORATOR_ORMS.find(([packageName]) =>
    declarations.some((declaration) =>
      decoratorNames(checker, declaration, [packageName]).includes('Entity'),
    ),
  )?.[1];
}

function baseClassOrm(symbol: TypeScript.Symbol): string | undefined {
  const packageName = packageOfSymbol(symbol);
  return BASE_CLASS_ORMS.find(
    ([owner, name]) => owner === packageName && name === symbol.name,
  )?.[2];
}

function unseenBases(
  checker: TypeScript.TypeChecker,
  type: TypeScript.InterfaceType,
  seen: Set<TypeScript.Type>,
): TypeScript.Type[] {
  const fresh = checker.getBaseTypes(type).filter((base) => !seen.has(base));
  for (const base of fresh) {
    seen.add(base);
  }
  return fresh;
}

function classOrm(checker: TypeScript.TypeChecker, type: TypeScript.Type): string | undefined {
  const chain = [type];
  const seen = new Set(chain);
  for (const current of chain) {
    const symbol = current.getSymbol();
    const orm =
      symbol === undefined ? undefined : (decoratedOrm(checker, symbol) ?? baseClassOrm(symbol));
    if (orm !== undefined) {
      return orm;
    }
    if (current.isClassOrInterface()) {
      chain.push(...unseenBases(checker, current, seen));
    }
  }
  return undefined;
}

function isPrismaModel(symbol: TypeScript.Symbol): boolean {
  const declaration = symbol.declarations?.find((candidate) =>
    ts.isTypeAliasDeclaration(candidate),
  );
  return (
    declaration !== undefined &&
    ts.isSourceFile(declaration.parent) &&
    packageOfSymbol(symbol) === PRISMA &&
    (ts.isTypeLiteralNode(declaration.type) ||
      declaration.type.getText().includes('DefaultSelection'))
  );
}

const PRISMA_PAYLOAD = /^\$(\w+)Payload$/u;

function enclosingAlias(
  node: TypeScript.Node | undefined,
): TypeScript.TypeAliasDeclaration | undefined {
  return node === undefined ? undefined : ts.findAncestor(node, ts.isTypeAliasDeclaration);
}

function prismaPayloadModel(type: TypeScript.Type): string | undefined {
  const [first] = (type.flags & ts.TypeFlags.Object) === 0 ? [] : type.getProperties();
  const alias = enclosingAlias(first?.declarations?.[0]);
  if (alias === undefined) {
    return undefined;
  }
  const model = PRISMA_PAYLOAD.exec(alias.name.text)?.[1];
  return model !== undefined && packageOf(alias.getSourceFile().fileName) === PRISMA
    ? model
    : undefined;
}

const MONGOOSE_DOCUMENT = 'Document';
const MONGOOSE_DOC_TYPE = 2;

function entityName(
  checker: TypeScript.TypeChecker,
  type: TypeScript.Type,
  orm: string,
): string | undefined {
  const symbol = type.getSymbol();
  if (symbol === undefined) {
    return undefined;
  }
  if (
    orm !== 'Mongoose' ||
    symbol.name !== MONGOOSE_DOCUMENT ||
    packageOfSymbol(symbol) !== 'mongoose'
  ) {
    return symbol.name;
  }
  const model = typeArgumentsOf(checker, type)[MONGOOSE_DOC_TYPE]?.getSymbol();
  return model === undefined || model.name.startsWith('__') ? symbol.name : model.name;
}

function isReference(type: TypeScript.Type): type is TypeScript.TypeReference {
  return (
    'objectFlags' in type &&
    typeof type.objectFlags === 'number' &&
    (type.objectFlags & ts.ObjectFlags.Reference) !== 0
  );
}

function typeArgumentsOf(
  checker: TypeScript.TypeChecker,
  type: TypeScript.Type,
): readonly TypeScript.Type[] {
  return isReference(type) ? checker.getTypeArguments(type) : [];
}

function entityOf(checker: TypeScript.TypeChecker, type: TypeScript.Type): Entity | undefined {
  const alias = type.aliasSymbol;
  if (alias !== undefined && isPrismaModel(alias)) {
    return { name: alias.name, orm: 'Prisma' };
  }
  const model = prismaPayloadModel(type);
  if (model !== undefined) {
    return { name: model, orm: 'Prisma' };
  }
  const orm = (type.flags & ts.TypeFlags.Object) === 0 ? undefined : classOrm(checker, type);
  const name = orm === undefined ? undefined : entityName(checker, type, orm);
  return orm === undefined || name === undefined ? undefined : { name, orm };
}

export function entitiesIn(checker: TypeScript.TypeChecker, type: TypeScript.Type): Entity[] {
  return findInType(checker, type, (candidate) => entityOf(checker, candidate));
}
