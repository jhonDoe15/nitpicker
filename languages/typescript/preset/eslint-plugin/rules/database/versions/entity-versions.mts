import type TypeScript from 'typescript';
import type { TSESTree } from '@typescript-eslint/utils';
import { ts } from '../../typed/typescript-views.mts';
import { typeServices, type Context } from '../../security/security-values.mts';

export type VersionForm = 'typeorm' | 'mikro' | 'sequelize';
type Mapping = 'unversioned' | 'versioned' | 'unmapped';
export type Unversioned = { readonly entity: string; readonly form: VersionForm };

const MAX_BASES = 3;
const TYPEORM: VersionForm = 'typeorm';
const MIKRO: VersionForm = 'mikro';
const SEQUELIZE: VersionForm = 'sequelize';
const ENTITY = 'Entity';
const TABLE = 'Table';
const MODEL = 'Model';
const VERSION_COLUMN = 'VersionColumn';
const FAMILIES: readonly (readonly [VersionForm, (source: string) => boolean])[] = [
  [TYPEORM, (source) => source === 'typeorm'],
  [MIKRO, (source) => source.startsWith('@mikro-orm/')],
  [SEQUELIZE, (source) => source === 'sequelize' || source === 'sequelize-typescript'],
];

function decoratorsOf(node: TypeScript.Node): readonly TypeScript.Decorator[] {
  return ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
}

function decoratorCall(decorator: TypeScript.Decorator): TypeScript.Expression {
  return decorator.expression;
}

function decoratorName(decorator: TypeScript.Decorator): string | undefined {
  const { expression } = decorator;
  const callee = ts.isCallExpression(expression) ? expression.expression : expression;
  return ts.isIdentifier(callee) ? callee.text : undefined;
}

function isVersionOption(property: TypeScript.ObjectLiteralElementLike): boolean {
  return (
    ts.isPropertyAssignment(property) &&
    property.name.getText() === 'version' &&
    property.initializer.kind === ts.SyntaxKind.TrueKeyword
  );
}

function optionsHaveVersion(args: readonly TypeScript.Node[]): boolean {
  return args.some(
    (argument) =>
      ts.isObjectLiteralExpression(argument) && argument.properties.some(isVersionOption),
  );
}

function hasVersionOption(call: TypeScript.Node | undefined): boolean {
  return call !== undefined && ts.isCallExpression(call) && optionsHaveVersion(call.arguments);
}

function importSources(file: TypeScript.SourceFile): string[] {
  return file.statements
    .filter(ts.isImportDeclaration)
    .map((statement) => statement.moduleSpecifier)
    .filter(ts.isStringLiteral)
    .map((specifier) => specifier.text);
}

function formOf(declaration: TypeScript.ClassDeclaration): VersionForm | undefined {
  const sources = importSources(declaration.getSourceFile());
  return FAMILIES.find(([, matches]) => sources.some(matches))?.[0];
}

function baseDeclaration(
  checker: TypeScript.TypeChecker,
  declaration: TypeScript.ClassDeclaration,
): TypeScript.ClassDeclaration | undefined {
  const clause = declaration.heritageClauses?.find(
    (each) => each.token === ts.SyntaxKind.ExtendsKeyword,
  );
  const base = clause?.types[0];
  const symbol = base === undefined ? undefined : checker.getTypeAtLocation(base).getSymbol();
  return symbol?.declarations?.find(ts.isClassDeclaration);
}

function chainOf(
  checker: TypeScript.TypeChecker,
  declaration: TypeScript.ClassDeclaration,
): TypeScript.ClassDeclaration[] {
  const chain = [declaration];
  for (const current of chain.slice(0, MAX_BASES)) {
    const base = baseDeclaration(checker, current);
    if (base !== undefined) {
      chain.push(base);
    }
  }
  return chain;
}

function membersDecorated(
  chain: readonly TypeScript.ClassDeclaration[],
  test: (decorator: TypeScript.Decorator) => boolean,
): boolean {
  return chain.some((each) => each.members.some((member) => decoratorsOf(member).some(test)));
}

function isMikroVersion(decorator: TypeScript.Decorator): boolean {
  return decoratorName(decorator) === 'Property' && hasVersionOption(decoratorCall(decorator));
}

function sequelizeInit(
  declaration: TypeScript.ClassDeclaration,
): TypeScript.CallExpression | undefined {
  const name = declaration.name?.text;
  let found: TypeScript.CallExpression | undefined;
  function visit(node: TypeScript.Node): void {
    const callee = ts.isCallExpression(node) ? node.expression : undefined;
    if (
      ts.isCallExpression(node) &&
      callee !== undefined &&
      ts.isPropertyAccessExpression(callee) &&
      callee.name.text === 'init' &&
      callee.expression.getText() === name
    ) {
      found = node;
    }
    ts.forEachChild(node, visit);
  }
  visit(declaration.getSourceFile());
  return found;
}

function extendsModel(declaration: TypeScript.ClassDeclaration): boolean {
  return (declaration.heritageClauses ?? []).some((clause) =>
    clause.types.some((type) => type.expression.getText() === MODEL),
  );
}

function mappingOf(unversioned: boolean): Mapping {
  return unversioned ? 'unversioned' : 'versioned';
}

function sequelizeMapping(declaration: TypeScript.ClassDeclaration): Mapping {
  const table = decoratorsOf(declaration).find((each) => decoratorName(each) === TABLE);
  if (table !== undefined) {
    return mappingOf(!hasVersionOption(decoratorCall(table)));
  }
  const init = extendsModel(declaration) ? sequelizeInit(declaration) : undefined;
  return init === undefined ? 'unmapped' : mappingOf(!optionsHaveVersion(init.arguments.slice(1)));
}

function isTypeormVersion(decorator: TypeScript.Decorator): boolean {
  return decoratorName(decorator) === VERSION_COLUMN;
}

function mappingFor(
  checker: TypeScript.TypeChecker,
  declaration: TypeScript.ClassDeclaration,
  form: VersionForm,
): Mapping {
  if (form === SEQUELIZE) {
    return sequelizeMapping(declaration);
  }
  if (!decoratorsOf(declaration).some((each) => decoratorName(each) === ENTITY)) {
    return 'unmapped';
  }
  const test = form === TYPEORM ? isTypeormVersion : isMikroVersion;
  return mappingOf(!membersDecorated(chainOf(checker, declaration), test));
}

function classOf(
  checker: TypeScript.TypeChecker,
  type: TypeScript.Type,
): TypeScript.ClassDeclaration | undefined {
  const plain = checker.getNonNullableType(type);
  const element = checker.getIndexTypeOfType(plain, ts.IndexKind.Number) ?? plain;
  return element.getSymbol()?.declarations?.find(ts.isClassDeclaration);
}

export function unversionedEntity(context: Context, node: TSESTree.Node): Unversioned | undefined {
  const services = typeServices(context);
  if (services === undefined) {
    return undefined;
  }
  const checker = services.program.getTypeChecker();
  const declaration = classOf(checker, services.getTypeAtLocation(node));
  const form = declaration === undefined ? undefined : formOf(declaration);
  if (declaration?.name === undefined || form === undefined) {
    return undefined;
  }
  return mappingFor(checker, declaration, form) === 'unversioned'
    ? { entity: declaration.name.text, form }
    : undefined;
}
