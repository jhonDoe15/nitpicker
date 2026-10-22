import ts from 'typescript';
import { decoratorNames } from '../contracts/decorators.mjs';
import { packageOf } from '../contracts/infrastructure-types.mjs';
import { findInType } from '../contracts/type-walk.mjs';

const DECORATOR_ORMS = [
  ['typeorm', 'TypeORM'],
  ['@mikro-orm/*', 'MikroORM'],
];
const BASE_CLASS_ORMS = [
  ['sequelize', 'Model', 'Sequelize'],
  ['mongoose', 'Document', 'Mongoose'],
];
const PRISMA = '@prisma/client';

function packageOfSymbol(symbol) {
  const declaration = symbol?.declarations?.[0];
  return declaration === undefined ? undefined : packageOf(declaration.getSourceFile().fileName);
}

function decoratedOrm(checker, symbol) {
  const declarations = (symbol.declarations ?? []).filter(ts.isClassLike);
  return DECORATOR_ORMS.find(([packageName]) =>
    declarations.some((declaration) =>
      decoratorNames(checker, declaration, [packageName]).includes('Entity'),
    ),
  )?.[1];
}

function baseClassOrm(symbol) {
  const packageName = packageOfSymbol(symbol);
  return BASE_CLASS_ORMS.find(
    ([owner, name]) => owner === packageName && name === symbol.name,
  )?.[2];
}

function classOrm(checker, type) {
  const chain = [type];
  for (const current of chain) {
    const symbol = current.getSymbol();
    const orm =
      symbol === undefined ? undefined : (decoratedOrm(checker, symbol) ?? baseClassOrm(symbol));
    if (orm !== undefined) {
      return orm;
    }
    if (current.isClassOrInterface()) {
      chain.push(...(checker.getBaseTypes(current) ?? []).filter((base) => !chain.includes(base)));
    }
  }
  return undefined;
}

function isPrismaModel(symbol) {
  const declaration = symbol?.declarations?.find(ts.isTypeAliasDeclaration);
  return (
    declaration !== undefined &&
    ts.isSourceFile(declaration.parent) &&
    packageOfSymbol(symbol) === PRISMA &&
    (ts.isTypeLiteralNode(declaration.type) ||
      declaration.type.getText().includes('DefaultSelection'))
  );
}

function entityOf(checker, type) {
  if (isPrismaModel(type.aliasSymbol)) {
    return { name: type.aliasSymbol.name, orm: 'Prisma' };
  }
  const orm = (type.flags & ts.TypeFlags.Object) === 0 ? undefined : classOrm(checker, type);
  return orm === undefined ? undefined : { name: type.getSymbol().name, orm };
}

export function entitiesIn(checker, type) {
  return findInType(checker, type, (candidate) => entityOf(checker, candidate));
}
