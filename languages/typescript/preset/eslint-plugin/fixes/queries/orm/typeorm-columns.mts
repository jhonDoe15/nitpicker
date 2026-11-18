import type TypeScript from 'typescript';
import { packageFromPath } from '../../../rules/support/io/packages.mts';
import { aliasedSymbolAt, isReference, ts } from '../../../rules/typed/typescript-views.mts';

export type KeyColumn = {
  readonly primary: boolean;
  readonly unique: boolean;
  readonly type: 'string' | 'number';
  readonly comparable: boolean;
};

type Checker = TypeScript.TypeChecker;
type Draft = {
  type: string | undefined;
  strategy: string | undefined;
  unique: boolean;
  primary: boolean;
  exact: boolean;
};

export const TYPEORM_PACKAGES: ReadonlySet<string> = new Set(['typeorm', '@n8n/typeorm']);

const COLUMNS = new Set(['Column', 'PrimaryColumn', 'PrimaryGeneratedColumn']);
const RELATIONS = new Set([
  'ManyToOne',
  'OneToOne',
  'OneToMany',
  'ManyToMany',
  'TreeParent',
  'TreeChildren',
]);
const BANNED_OPTIONS = new Set([
  'transformer',
  'array',
  'collation',
  'enum',
  'generatedType',
  'asExpression',
  'srid',
  'spatialFeatureType',
  'hstoreType',
]);
const TEXT_TYPES = new Set(['varchar', 'character varying', 'text', 'string']);
const NUMBER_TYPES = new Set([
  'int',
  'integer',
  'int2',
  'int4',
  'smallint',
  'mediumint',
  'tinyint',
]);
const CASE_FOLDING_DRIVERS = ['mysql', 'mysql2', 'mariadb', 'mssql', 'tedious'];

export function decoratorsOf(node: TypeScript.Node): readonly TypeScript.Decorator[] {
  return ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
}

export function typeormName(checker: Checker, decorator: TypeScript.Decorator): string | undefined {
  const call = decorator.expression;
  if (!ts.isCallExpression(call)) {
    return undefined;
  }
  const callee = ts.isPropertyAccessExpression(call.expression)
    ? call.expression.name
    : call.expression;
  const symbol = aliasedSymbolAt(checker, callee);
  const file = symbol?.declarations?.[0]?.getSourceFile().fileName;
  const pkg = file === undefined ? undefined : packageFromPath(file);
  return pkg !== undefined && TYPEORM_PACKAGES.has(pkg) ? symbol?.name : undefined;
}

function textOf(node: TypeScript.Node): string | undefined {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
    ? node.text
    : undefined;
}

function flagOf(node: TypeScript.Node): boolean | undefined {
  if (node.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }
  return node.kind === ts.SyntaxKind.FalseKeyword ? false : undefined;
}

function applyOption(draft: Draft, name: string, value: TypeScript.Expression): boolean {
  if (BANNED_OPTIONS.has(name)) {
    draft.exact = false;
    return true;
  }
  if (name === 'type') {
    draft.type = textOf(value)?.toLowerCase();
    return draft.type !== undefined;
  }
  if (name === 'unique' || name === 'primary') {
    const flag = flagOf(value);
    draft[name] = flag === true;
    return flag !== undefined;
  }
  if (name === 'generated') {
    draft.strategy = flagOf(value) === true ? 'increment' : textOf(value);
    return draft.strategy !== undefined;
  }
  return true;
}

function readObject(draft: Draft, object: TypeScript.ObjectLiteralExpression): boolean {
  return object.properties.every(
    (property) =>
      ts.isPropertyAssignment(property) &&
      (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) &&
      applyOption(draft, property.name.text, property.initializer),
  );
}

function readArguments(
  draft: Draft,
  name: string,
  args: readonly TypeScript.Expression[],
): boolean {
  return args.every((argument) => {
    const text = textOf(argument);
    if (text !== undefined) {
      draft[name === 'PrimaryGeneratedColumn' ? 'strategy' : 'type'] = text.toLowerCase();
      return true;
    }
    return ts.isObjectLiteralExpression(argument) && readObject(draft, argument);
  });
}

function columnDraft(checker: Checker, declaration: TypeScript.Node): Draft | undefined {
  const found = decoratorsOf(declaration)
    .map((decorator) => ({ decorator, name: typeormName(checker, decorator) }))
    .filter(({ name }) => name !== undefined && COLUMNS.has(name));
  const [only] = found;
  if (found.length !== 1 || only?.name === undefined) {
    return undefined;
  }
  const { decorator, name } = only;
  const draft: Draft = {
    type: undefined,
    strategy: undefined,
    unique: false,
    primary: false,
    exact: true,
  };
  const call = decorator.expression;
  if (!ts.isCallExpression(call) || !readArguments(draft, name, call.arguments)) {
    return undefined;
  }
  draft.primary = draft.primary || name !== 'Column';
  if (name === 'PrimaryGeneratedColumn') {
    draft.exact = draft.exact && (draft.strategy ?? 'increment') === 'increment';
  } else if (draft.strategy !== undefined) {
    draft.exact = false;
  }
  return draft;
}

function uniqueByClass(
  checker: Checker,
  declaration: TypeScript.PropertyDeclaration,
  property: string,
): boolean {
  const owner = declaration.parent;
  return decoratorsOf(owner)
    .filter((decorator) => typeormName(checker, decorator) === 'Unique')
    .some((decorator) => {
      const call = decorator.expression;
      const columns = ts.isCallExpression(call)
        ? call.arguments.filter(ts.isArrayLiteralExpression)
        : [];
      return columns.some(
        ({ elements }) => elements.length === 1 && elements.every((e) => textOf(e) === property),
      );
    });
}

function scalarOf(type: TypeScript.Type): 'string' | 'number' | undefined {
  if ((type.flags & ts.TypeFlags.String) !== 0) {
    return 'string';
  }
  return (type.flags & ts.TypeFlags.Number) !== 0 ? 'number' : undefined;
}

function propertyDeclarations(
  checker: Checker,
  entity: TypeScript.Type,
): { readonly name: string; readonly declaration: TypeScript.PropertyDeclaration }[] {
  return checker.getPropertiesOfType(entity).flatMap((symbol) => {
    const declaration = symbol.valueDeclaration;
    return declaration !== undefined && ts.isPropertyDeclaration(declaration)
      ? [{ name: symbol.name, declaration }]
      : [];
  });
}

function primaryNames(checker: Checker, entity: TypeScript.Type): string[] {
  return propertyDeclarations(checker, entity)
    .filter(({ declaration }) => columnDraft(checker, declaration)?.primary === true)
    .map(({ name }) => name);
}

export function primaryProperty(checker: Checker, entity: TypeScript.Type): string | undefined {
  const names = primaryNames(checker, entity);
  return names.length === 1 ? names[0] : undefined;
}

export function foldsCase(dependencies: ReadonlySet<string>): boolean {
  return CASE_FOLDING_DRIVERS.some((name) => dependencies.has(name));
}

function isExactType(
  scalar: 'string' | 'number',
  dbType: string | undefined,
  dependencies: ReadonlySet<string>,
): boolean {
  const allowed = scalar === 'string' ? TEXT_TYPES : NUMBER_TYPES;
  const typeFits = dbType === undefined || allowed.has(dbType);
  return typeFits && !(scalar === 'string' && foldsCase(dependencies));
}

export function typeormKeyColumn(
  checker: Checker,
  entity: TypeScript.Type,
  {
    property,
    dependencies,
  }: { readonly property: string; readonly dependencies: ReadonlySet<string> },
): KeyColumn | undefined {
  const symbol = checker.getPropertyOfType(entity, property);
  const declaration = symbol?.valueDeclaration;
  if (symbol === undefined || declaration === undefined || !ts.isPropertyDeclaration(declaration)) {
    return undefined;
  }
  const draft = columnDraft(checker, declaration);
  const type = scalarOf(checker.getTypeOfSymbolAtLocation(symbol, declaration));
  if (draft === undefined || type === undefined) {
    return undefined;
  }
  return {
    primary: draft.primary && primaryNames(checker, entity).length === 1,
    unique: draft.unique || uniqueByClass(checker, declaration, property),
    type,
    comparable: draft.exact && isExactType(type, draft.type, dependencies),
  };
}

function relatedTypes(checker: Checker, type: TypeScript.Type): TypeScript.Type[] {
  const members = type.isUnion() ? type.types : [type];
  return members.flatMap((member) => [
    member,
    ...(isReference(member) ? checker.getTypeArguments(member) : []),
  ]);
}

export function isSelfReferencing(checker: Checker, entity: TypeScript.Type): boolean {
  const own = entity.getSymbol();
  return propertyDeclarations(checker, entity).some(({ name, declaration }) => {
    const isRelation = decoratorsOf(declaration).some((decorator) =>
      RELATIONS.has(typeormName(checker, decorator) ?? ''),
    );
    const symbol = checker.getPropertyOfType(entity, name);
    return (
      isRelation &&
      symbol !== undefined &&
      relatedTypes(checker, checker.getTypeOfSymbolAtLocation(symbol, declaration)).some(
        (candidate) => candidate.getSymbol() === own,
      )
    );
  });
}
