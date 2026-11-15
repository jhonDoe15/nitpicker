import {
  AST_NODE_TYPES,
  TSESLint,
  type ParserServicesWithTypeInformation,
  type TSESTree,
} from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { findVariable, isFunctionNode } from '../analysis/constant-resolution.mts';
import { isMemberCall, type MemberCall } from '../events/emitter-creations.mts';
import type { Context } from '../security/security-values.mts';
import { estreeCallView } from '../support/io/call-views.mts';
import {
  calleeDeclaration,
  functionLike,
  type TsFunction,
} from '../support/io/implementations.mts';
import { ancestorsOf, nameOf } from '../typed/node-views.mts';
import { ts } from '../typed/typescript-views.mts';
import {
  decoratedRelation,
  tsLazyRelation,
  typeormDeclaration,
  type Relation,
} from './relations/typeorm-schema.mts';

type Services = ParserServicesWithTypeInformation;
export type QueryOrigin = {
  readonly call: MemberCall;
  readonly method: string;
  readonly label: string;
  readonly options: number;
};

const { DefinitionType } = TSESLint.Scope;

const FINDERS = new Set(['find', 'findAndCount']);
const WHERE_FINDERS = new Set(['findBy', 'findAndCountBy']);
const JOINS = new Set(
  ['left', 'inner'].flatMap((side) =>
    ['AndSelect', 'AndMapMany', 'AndMapOne'].map((kind) => `${side}Join${kind}`),
  ),
);

export function lazyBinding(
  services: Services,
  source: TSESTree.Node,
  name: string,
): Relation | undefined {
  const expression = services.esTreeNodeToTSNodeMap.get(source);
  const property = services.program
    .getTypeChecker()
    .getTypeAtLocation(expression)
    .getProperty(name);
  return decoratedRelation(services.program, { expression, name: { text: name }, property });
}

export function lazyRelation(services: Services, member: TSESTree.Node): Relation | undefined {
  return tsLazyRelation(services.program, services.esTreeNodeToTSNodeMap.get(member));
}

function awaitedRelation(
  program: TypeScript.Program,
  fn: TsFunction,
  index: number,
): (Relation & { readonly access: string }) | undefined {
  const name = fn.parameters[index]?.name;
  const checker = program.getTypeChecker();
  const parameter =
    name !== undefined && ts.isIdentifier(name) ? checker.getSymbolAtLocation(name) : undefined;
  const pending: TypeScript.Node[] = parameter === undefined ? [] : [fn.body];
  for (const node of pending) {
    const member = ts.isAwaitExpression(node) ? node.expression : undefined;
    const isParameter =
      member !== undefined &&
      ts.isPropertyAccessExpression(member) &&
      checker.getSymbolAtLocation(member.expression) === parameter;
    const relation = isParameter ? tsLazyRelation(program, member) : undefined;
    if (relation !== undefined && member !== undefined) {
      return { ...relation, access: member.getText() };
    }
    ts.forEachChild(node, (child) => {
      pending.push(child);
    });
  }
  return undefined;
}

export function helperRelation(
  services: Services,
  reference: TSESTree.Node,
  index: number,
): (Relation & { readonly access: string }) | undefined {
  const node = services.esTreeNodeToTSNodeMap.get(reference);
  const name = ts.isPropertyAccessExpression(node) ? node.name : node;
  const declaration = calleeDeclaration(services.program.getTypeChecker(), name);
  const fn = declaration === undefined ? undefined : functionLike(declaration);
  return fn === undefined ? undefined : awaitedRelation(services.program, fn, index);
}

function nearestFunction(node: TSESTree.Node): TSESTree.Node | undefined {
  return ancestorsOf(node).find(isFunctionNode);
}

export function awaited(node: TSESTree.Node | undefined): TSESTree.Node | undefined {
  return node?.type === AST_NODE_TYPES.AwaitExpression ? node.argument : node;
}

function constantQuery(
  context: Context,
  identifier: TSESTree.Identifier,
  loop: TSESTree.Node,
): TSESTree.Node | undefined {
  const definition = findVariable(context, identifier, identifier.name)?.defs[0];
  if (definition?.type !== DefinitionType.Variable || definition.parent.kind !== 'const') {
    return undefined;
  }
  const local = nearestFunction(definition.node) === nearestFunction(loop);
  return local ? awaited(definition.node.init ?? undefined) : undefined;
}

function queryCall(
  context: Context,
  iterable: TSESTree.Node,
  loop: TSESTree.Node,
): TSESTree.Node | undefined {
  const value = awaited(iterable);
  return value?.type === AST_NODE_TYPES.Identifier ? constantQuery(context, value, loop) : value;
}

export function originQuery(
  context: Context,
  services: Services,
  { iterable, loop }: { readonly iterable: TSESTree.Node; readonly loop: TSESTree.Node },
): QueryOrigin | undefined {
  const call = queryCall(context, iterable, loop);
  if (call?.type !== AST_NODE_TYPES.CallExpression || !isMemberCall(call)) {
    return undefined;
  }
  const { callee } = call;
  if (callee.computed) {
    return undefined;
  }
  const method = nameOf(callee.property) ?? '';
  const known = FINDERS.has(method) || WHERE_FINDERS.has(method) || method === 'getMany';
  const checker = services.program.getTypeChecker();
  const declaration = known
    ? typeormDeclaration(checker, services.esTreeNodeToTSNodeMap.get(callee.property))
    : undefined;
  if (declaration === undefined) {
    return undefined;
  }
  const owner = declaration.parent;
  const managed =
    (ts.isClassLike(owner) || ts.isInterfaceDeclaration(owner)) &&
    owner.name?.text === 'EntityManager';
  return { call, method, label: estreeCallView(call, undefined).label, options: managed ? 1 : 0 };
}

function namesRelation(element: TSESTree.Node | undefined, relation: string): boolean {
  return (
    element?.type !== AST_NODE_TYPES.Literal ||
    element.value === relation ||
    String(element.value).startsWith(`${relation}.`)
  );
}

function relationsFetch(relations: TSESTree.Node, relation: string): boolean {
  if (relations.type === AST_NODE_TYPES.ArrayExpression) {
    return relations.elements.some((element) => namesRelation(element ?? undefined, relation));
  }
  if (relations.type !== AST_NODE_TYPES.ObjectExpression) {
    return true;
  }
  return relations.properties.some(
    (property) =>
      property.type !== AST_NODE_TYPES.Property ||
      property.computed ||
      nameOf(property.key) === relation,
  );
}

function optionsFetch(options: TSESTree.Node | undefined, relation: string): boolean {
  if (options?.type !== AST_NODE_TYPES.ObjectExpression) {
    return options !== undefined;
  }
  const relations = options.properties.find(
    (property) => property.type !== AST_NODE_TYPES.Property || nameOf(property.key) === 'relations',
  );
  return (
    relations !== undefined &&
    (relations.type !== AST_NODE_TYPES.Property || relationsFetch(relations.value, relation))
  );
}

function joinsRelation(call: MemberCall, relation: string): boolean {
  const [path] = call.arguments;
  return (
    JOINS.has(nameOf(call.callee.property) ?? '') &&
    (path?.type !== AST_NODE_TYPES.Literal || String(path.value).endsWith(`.${relation}`))
  );
}

function builderFetches(call: MemberCall, relation: string): boolean {
  const links: MemberCall[] = [];
  const pending: TSESTree.Node[] = [call.callee.object];
  for (const node of pending) {
    if (node.type === AST_NODE_TYPES.CallExpression && isMemberCall(node)) {
      links.push(node);
      pending.push(node.callee.object);
    }
  }
  const root = links.at(-1);
  const created = nameOf(root?.callee.property) === 'createQueryBuilder';
  return !created || links.some((link) => joinsRelation(link, relation));
}

export function isFetched({ call, method, options }: QueryOrigin, relation: string): boolean {
  if (WHERE_FINDERS.has(method)) {
    return false;
  }
  return FINDERS.has(method)
    ? optionsFetch(call.arguments[options], relation)
    : builderFetches(call, relation);
}
