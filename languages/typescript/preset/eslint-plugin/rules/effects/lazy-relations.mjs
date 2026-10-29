import ts from 'typescript';
import { ancestorsOf } from '../analysis/ancestry.mjs';
import { findVariable } from '../analysis/constant-resolution.mjs';
import { estreeCallView } from '../support/io/call-views.mjs';
import { calleeDeclaration, functionLike, resolvedSymbol } from '../support/io/implementations.mjs';
import { packageFromPath } from '../support/io/packages.mjs';
import { memoized } from '../support/memo.mjs';

const RELATIONS = new Set(['ManyToOne', 'OneToMany', 'OneToOne', 'ManyToMany']);
const FINDERS = new Set(['find', 'findAndCount']);
const WHERE_FINDERS = new Set(['findBy', 'findAndCountBy']);
const JOINS = new Set([
  'leftJoinAndSelect',
  'innerJoinAndSelect',
  'leftJoinAndMapMany',
  'innerJoinAndMapMany',
  'leftJoinAndMapOne',
  'innerJoinAndMapOne',
]);
const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const TYPEORM = 'typeorm';
const PROPERTY = 'Property';
const ENTITY_SCHEMA = 'EntitySchema';
const OPEN_TYPES = new Set([undefined, 'ObjectLiteral', '__type']);
const schemaIndexes = new WeakMap();

function typeormDeclaration(checker, node) {
  const declaration = resolvedSymbol(checker, node)?.declarations?.[0];
  const fromTypeorm =
    declaration !== undefined && packageFromPath(declaration.getSourceFile().fileName) === TYPEORM;
  return fromTypeorm ? declaration : undefined;
}

function isFromTypeorm(checker, node) {
  return typeormDeclaration(checker, node) !== undefined;
}

function isLazyOption(argument) {
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

function relationDecorator(checker, declaration) {
  const decorators = ts.canHaveDecorators(declaration) ? (ts.getDecorators(declaration) ?? []) : [];
  return decorators
    .map(({ expression }) => expression)
    .find(
      (expression) =>
        ts.isCallExpression(expression) &&
        ts.isIdentifier(expression.expression) &&
        RELATIONS.has(expression.expression.text) &&
        isFromTypeorm(checker, expression.expression),
    );
}

function isPromiseTyped(declaration) {
  const { type } = declaration;
  return (
    type !== undefined && ts.isTypeReferenceNode(type) && type.typeName.getText() === 'Promise'
  );
}

function propertyValue(object, name) {
  const property = object.properties.find(
    (each) => ts.isPropertyAssignment(each) && each.name.getText() === name,
  );
  return property?.initializer;
}

function schemaName(options) {
  const name = propertyValue(options, 'name');
  return name !== undefined && ts.isStringLiteral(name) ? name.text : undefined;
}

function schemaRelations(checker, node) {
  const callee = ts.isPropertyAccessExpression(node.expression)
    ? node.expression.name
    : node.expression;
  const [options] = node.arguments ?? [];
  const isSchema =
    ts.isIdentifier(callee) &&
    callee.text === ENTITY_SCHEMA &&
    options !== undefined &&
    ts.isObjectLiteralExpression(options) &&
    isFromTypeorm(checker, callee);
  const relations = isSchema ? propertyValue(options, 'relations') : undefined;
  if (relations === undefined || !ts.isObjectLiteralExpression(relations)) {
    return [];
  }
  const typeName = node.typeArguments?.[0]?.getText();
  const entity = schemaName(options) ?? typeName;
  return relations.properties
    .filter((each) => ts.isPropertyAssignment(each) && isLazyOption(each.initializer))
    .map((each) => ({ entity, typeName, relation: each.name.getText() }));
}

function schemaIndex(program) {
  return memoized(schemaIndexes, program, () => {
    const checker = program.getTypeChecker();
    const found = [];
    const pending = program
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

function schemaRelation(program, member) {
  const relation = member.name.text;
  const candidates = schemaIndex(program).filter((each) => each.relation === relation);
  if (candidates.length === 0) {
    return undefined;
  }
  const type = program.getTypeChecker().getTypeAtLocation(member.expression);
  const typeName = (type.aliasSymbol ?? type.getSymbol())?.name;
  const open = (type.flags & ts.TypeFlags.Any) !== 0 || OPEN_TYPES.has(typeName);
  const match =
    candidates.find((each) => each.typeName === typeName || each.entity === typeName) ??
    (open ? candidates[0] : undefined);
  return match === undefined ? undefined : { entity: match.entity ?? 'entity', relation };
}

function decoratedRelation(program, member) {
  const checker = program.getTypeChecker();
  const declaration = checker
    .getSymbolAtLocation(member.name)
    ?.declarations?.find(ts.isPropertyDeclaration);
  const decorator = declaration && relationDecorator(checker, declaration);
  const lazy =
    decorator !== undefined &&
    (decorator.arguments.some(isLazyOption) || isPromiseTyped(declaration));
  return lazy
    ? { entity: declaration.parent.name?.text ?? 'entity', relation: member.name.text }
    : undefined;
}

function tsLazyRelation(program, member) {
  return ts.isPropertyAccessExpression(member) && ts.isIdentifier(member.name)
    ? (decoratedRelation(program, member) ?? schemaRelation(program, member))
    : undefined;
}

export function lazyRelation(services, member) {
  return tsLazyRelation(services.program, services.esTreeNodeToTSNodeMap.get(member));
}

function awaitedRelation(program, fn, index) {
  const name = fn.parameters[index]?.name;
  const checker = program.getTypeChecker();
  const parameter =
    name !== undefined && ts.isIdentifier(name) && checker.getSymbolAtLocation(name);
  const pending = parameter ? [fn.body] : [];
  for (const node of pending) {
    const member = ts.isAwaitExpression(node) ? node.expression : undefined;
    const isParameter =
      member !== undefined &&
      ts.isPropertyAccessExpression(member) &&
      checker.getSymbolAtLocation(member.expression) === parameter;
    const relation = isParameter ? tsLazyRelation(program, member) : undefined;
    if (relation !== undefined) {
      return { ...relation, access: member.getText() };
    }
    ts.forEachChild(node, (child) => {
      pending.push(child);
    });
  }
  return undefined;
}

export function helperRelation(services, reference, index) {
  const node = services.esTreeNodeToTSNodeMap.get(reference);
  const name = ts.isPropertyAccessExpression(node) ? node.name : node;
  const declaration = calleeDeclaration(services.program.getTypeChecker(), name);
  const fn = declaration && functionLike(declaration);
  return fn === undefined ? undefined : awaitedRelation(services.program, fn, index);
}

function nearestFunction(node) {
  return ancestorsOf(node).find((ancestor) => FUNCTIONS.has(ancestor.type));
}

export function awaited(node) {
  return node?.type === 'AwaitExpression' ? node.argument : node;
}

function constantQuery(context, identifier, loop) {
  const definition = findVariable(context, identifier, identifier.name)?.defs[0];
  const isConstant = definition?.type === 'Variable' && definition.parent.kind === 'const';
  const local = isConstant && nearestFunction(definition.node) === nearestFunction(loop);
  return local ? awaited(definition.node.init) : undefined;
}

function queryCall(context, iterable, loop) {
  const value = awaited(iterable);
  return value?.type === 'Identifier' ? constantQuery(context, value, loop) : value;
}

export function originQuery(context, services, { iterable, loop }) {
  const call = queryCall(context, iterable, loop);
  const callee = call?.type === 'CallExpression' ? call.callee : undefined;
  if (callee?.type !== 'MemberExpression' || callee.computed) {
    return undefined;
  }
  const method = callee.property.name;
  const known = FINDERS.has(method) || WHERE_FINDERS.has(method) || method === 'getMany';
  const checker = services.program.getTypeChecker();
  const declaration =
    known && typeormDeclaration(checker, services.esTreeNodeToTSNodeMap.get(callee.property));
  if (!declaration) {
    return undefined;
  }
  const managed = declaration.parent?.name?.text === 'EntityManager';
  return { call, method, label: estreeCallView(call).label, options: managed ? 1 : 0 };
}

function namesRelation(element, relation) {
  return (
    element?.type !== 'Literal' ||
    element.value === relation ||
    String(element.value).startsWith(`${relation}.`)
  );
}

function relationsFetch(relations, relation) {
  if (relations.type === 'ArrayExpression') {
    return relations.elements.some((element) => namesRelation(element, relation));
  }
  if (relations.type !== 'ObjectExpression') {
    return true;
  }
  return relations.properties.some(
    (property) => property.type !== PROPERTY || property.computed || property.key.name === relation,
  );
}

function optionsFetch(options, relation) {
  if (options?.type !== 'ObjectExpression') {
    return options !== undefined;
  }
  const relations = options.properties.find(
    (property) => property.type !== PROPERTY || property.key.name === 'relations',
  );
  return (
    relations !== undefined &&
    (relations.type !== PROPERTY || relationsFetch(relations.value, relation))
  );
}

function joinsRelation(call, relation) {
  const [path] = call.arguments;
  return (
    JOINS.has(call.callee.property?.name) &&
    (path?.type !== 'Literal' || String(path.value).endsWith(`.${relation}`))
  );
}

function builderFetches(call, relation) {
  const links = [];
  const pending = [call.callee.object];
  for (const node of pending) {
    if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression') {
      links.push(node);
      pending.push(node.callee.object);
    }
  }
  const root = links.at(-1);
  const created = root?.callee.property.name === 'createQueryBuilder';
  return !created || links.some((link) => joinsRelation(link, relation));
}

export function isFetched({ call, method, options }, relation) {
  if (WHERE_FINDERS.has(method)) {
    return false;
  }
  return FINDERS.has(method)
    ? optionsFetch(call.arguments[options], relation)
    : builderFetches(call, relation);
}
