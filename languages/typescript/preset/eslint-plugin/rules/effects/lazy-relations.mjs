import ts from 'typescript';
import { ancestorsOf } from '../analysis/ancestry.mjs';
import { findVariable } from '../analysis/constant-resolution.mjs';
import { estreeCallView } from '../support/io/call-views.mjs';
import { resolvedSymbol } from '../support/io/implementations.mjs';
import { packageFromPath } from '../support/io/packages.mjs';

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

function isFromTypeorm(checker, node) {
  const declaration = resolvedSymbol(checker, node)?.declarations?.[0];
  return (
    declaration !== undefined && packageFromPath(declaration.getSourceFile().fileName) === TYPEORM
  );
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

export function lazyRelation(services, member) {
  const checker = services.program.getTypeChecker();
  const property = services.esTreeNodeToTSNodeMap.get(member.property);
  const declaration = checker
    .getSymbolAtLocation(property)
    ?.declarations?.find(ts.isPropertyDeclaration);
  const decorator = declaration && relationDecorator(checker, declaration);
  const lazy =
    decorator !== undefined &&
    (decorator.arguments.some(isLazyOption) || isPromiseTyped(declaration));
  return lazy
    ? { entity: declaration.parent.name?.text ?? 'entity', relation: member.property.name }
    : undefined;
}

function nearestFunction(node) {
  return ancestorsOf(node).find((ancestor) => FUNCTIONS.has(ancestor.type));
}

function awaited(node) {
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
  const typed =
    known && isFromTypeorm(checker, services.esTreeNodeToTSNodeMap.get(callee.property));
  return typed ? { call, method, label: estreeCallView(call).label } : undefined;
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

export function isFetched({ call, method }, relation) {
  if (WHERE_FINDERS.has(method)) {
    return false;
  }
  return FINDERS.has(method)
    ? optionsFetch(call.arguments[0], relation)
    : builderFetches(call, relation);
}
