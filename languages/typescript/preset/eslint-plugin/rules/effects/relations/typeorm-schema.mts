import type TypeScript from 'typescript';
import { packageFromPath } from '../../support/io/packages.mts';
import { resolvedSymbol } from '../../support/io/implementations.mts';
import { memoized } from '../../support/memo.mts';
import { ts } from '../../typed/typescript-views.mts';

export type Relation = { readonly entity: string; readonly relation: string };
type SchemaRelation = {
  readonly entity: string | undefined;
  readonly typeName: string | undefined;
  readonly relation: string;
};
export type Access = {
  readonly expression: TypeScript.Node;
  readonly name: { readonly text: string };
  readonly property: TypeScript.Symbol | undefined;
};

const RELATIONS = new Set(['ManyToOne', 'OneToMany', 'OneToOne', 'ManyToMany']);
const TYPEORM = 'typeorm';
const ENTITY_SCHEMA = 'EntitySchema';
const OPEN_TYPES = new Set<string | undefined>([undefined, 'ObjectLiteral', '__type']);
const schemaIndexes = new WeakMap<TypeScript.Program, SchemaRelation[]>();

export function typeormDeclaration(
  checker: TypeScript.TypeChecker,
  node: TypeScript.Node,
): TypeScript.Declaration | undefined {
  const declaration = resolvedSymbol(checker, node)?.declarations?.[0];
  const fromTypeorm =
    declaration !== undefined && packageFromPath(declaration.getSourceFile().fileName) === TYPEORM;
  return fromTypeorm ? declaration : undefined;
}

function isFromTypeorm(checker: TypeScript.TypeChecker, node: TypeScript.Node): boolean {
  return typeormDeclaration(checker, node) !== undefined;
}

function isLazyOption(argument: TypeScript.Node): boolean {
  return (
    ts.isObjectLiteralExpression(argument) &&
    argument.properties.some(
      (property) =>
        ts.isPropertyAssignment(property) &&
        property.name.getText() === 'lazy' &&
        property.initializer.kind === ts.SyntaxKind.TrueKeyword,
    )
  );
}

function relationDecorator(
  checker: TypeScript.TypeChecker,
  declaration: TypeScript.PropertyDeclaration,
): TypeScript.CallExpression | undefined {
  const decorators = ts.canHaveDecorators(declaration) ? (ts.getDecorators(declaration) ?? []) : [];
  return decorators
    .map(({ expression }) => expression)
    .find(
      (expression): expression is TypeScript.CallExpression =>
        ts.isCallExpression(expression) &&
        ts.isIdentifier(expression.expression) &&
        RELATIONS.has(expression.expression.text) &&
        isFromTypeorm(checker, expression.expression),
    );
}

function isPromiseTyped(declaration: TypeScript.PropertyDeclaration): boolean {
  const { type } = declaration;
  return (
    type !== undefined && ts.isTypeReferenceNode(type) && type.typeName.getText() === 'Promise'
  );
}

function propertyValue(
  object: TypeScript.ObjectLiteralExpression,
  name: string,
): TypeScript.Expression | undefined {
  const property = object.properties.find(
    (each): each is TypeScript.PropertyAssignment =>
      ts.isPropertyAssignment(each) && each.name.getText() === name,
  );
  return property?.initializer;
}

function schemaName(options: TypeScript.ObjectLiteralExpression): string | undefined {
  const name = propertyValue(options, 'name');
  return name !== undefined && ts.isStringLiteral(name) ? name.text : undefined;
}

function schemaRelations(
  checker: TypeScript.TypeChecker,
  node: TypeScript.NewExpression,
): SchemaRelation[] {
  const callee = ts.isPropertyAccessExpression(node.expression)
    ? node.expression.name
    : node.expression;
  const [options] = node.arguments ?? [];
  if (
    !ts.isIdentifier(callee) ||
    callee.text !== ENTITY_SCHEMA ||
    options === undefined ||
    !ts.isObjectLiteralExpression(options) ||
    !isFromTypeorm(checker, callee)
  ) {
    return [];
  }
  const relations = propertyValue(options, 'relations');
  if (relations === undefined || !ts.isObjectLiteralExpression(relations)) {
    return [];
  }
  const typeName = node.typeArguments?.[0]?.getText();
  const entity = schemaName(options) ?? typeName;
  return relations.properties
    .filter(
      (each): each is TypeScript.PropertyAssignment =>
        ts.isPropertyAssignment(each) && isLazyOption(each.initializer),
    )
    .map((each) => ({ entity, typeName, relation: each.name.getText() }));
}

function schemaIndex(program: TypeScript.Program): SchemaRelation[] {
  return memoized(schemaIndexes, program, () => {
    const checker = program.getTypeChecker();
    const found: SchemaRelation[] = [];
    const pending: TypeScript.Node[] = program
      .getSourceFiles()
      .filter((file) => !file.isDeclarationFile && file.text.includes(ENTITY_SCHEMA));
    for (const node of pending) {
      if (ts.isNewExpression(node)) {
        found.push(...schemaRelations(checker, node));
      }
      ts.forEachChild(node, (child) => {
        pending.push(child);
      });
    }
    return found;
  });
}

function schemaRelation(program: TypeScript.Program, access: Access): Relation | undefined {
  const relation = access.name.text;
  const candidates = schemaIndex(program).filter((each) => each.relation === relation);
  if (candidates.length === 0) {
    return undefined;
  }
  const type = program.getTypeChecker().getTypeAtLocation(access.expression);
  const typeName = (type.aliasSymbol ?? type.getSymbol())?.name;
  const open = (type.flags & ts.TypeFlags.Any) !== 0 || OPEN_TYPES.has(typeName);
  const match =
    candidates.find((each) => each.typeName === typeName || each.entity === typeName) ??
    (open ? candidates[0] : undefined);
  return match === undefined ? undefined : { entity: match.entity ?? 'entity', relation };
}

export function decoratedRelation(
  program: TypeScript.Program,
  access: Access,
): Relation | undefined {
  const checker = program.getTypeChecker();
  const declaration = access.property?.declarations?.find(ts.isPropertyDeclaration);
  const decorator = declaration === undefined ? undefined : relationDecorator(checker, declaration);
  if (
    declaration !== undefined &&
    decorator !== undefined &&
    (decorator.arguments.some(isLazyOption) || isPromiseTyped(declaration))
  ) {
    return { entity: declaration.parent.name?.text ?? 'entity', relation: access.name.text };
  }
  return schemaRelation(program, access);
}

export function tsLazyRelation(
  program: TypeScript.Program,
  member: TypeScript.Node,
): Relation | undefined {
  if (!(ts.isPropertyAccessExpression(member) && ts.isIdentifier(member.name))) {
    return undefined;
  }
  const property = program.getTypeChecker().getSymbolAtLocation(member.name);
  return decoratedRelation(program, { expression: member.expression, name: member.name, property });
}
