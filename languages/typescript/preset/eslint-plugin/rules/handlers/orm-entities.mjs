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

const PRISMA_PAYLOAD = /^\$(\w+)Payload$/u;

function enclosingAlias(node) {
  return node === undefined ? undefined : ts.findAncestor(node, ts.isTypeAliasDeclaration);
}

function prismaPayloadModel(type) {
  const [first] = (type.flags & ts.TypeFlags.Object) === 0 ? [] : type.getProperties();
  const alias = enclosingAlias(first?.declarations?.[0]);
  const model = alias === undefined ? undefined : PRISMA_PAYLOAD.exec(alias.name.text)?.[1];
  return model !== undefined && packageOf(alias.getSourceFile().fileName) === PRISMA
    ? model
    : undefined;
}

const MONGOOSE_DOCUMENT = 'Document';
const MONGOOSE_DOC_TYPE = 2;

function entityName(checker, type, orm) {
  const symbol = type.getSymbol();
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

function typeArgumentsOf(checker, type) {
  return (type.objectFlags & ts.ObjectFlags.Reference) === 0 ? [] : checker.getTypeArguments(type);
}

function entityOf(checker, type) {
  if (isPrismaModel(type.aliasSymbol)) {
    return { name: type.aliasSymbol.name, orm: 'Prisma' };
  }
  const model = prismaPayloadModel(type);
  if (model !== undefined) {
    return { name: model, orm: 'Prisma' };
  }
  const orm = (type.flags & ts.TypeFlags.Object) === 0 ? undefined : classOrm(checker, type);
  return orm === undefined ? undefined : { name: entityName(checker, type, orm), orm };
}

export function entitiesIn(checker, type) {
  return findInType(checker, type, (candidate) => entityOf(checker, candidate));
}
