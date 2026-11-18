import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { QueryOrigin } from '../../../rules/effects/lazy-relations.mts';
import type { Relation } from '../../../rules/effects/relations/typeorm-schema.mts';
import type { Context } from '../../../rules/security/security-values.mts';
import { appendingArgument } from '../../support/calls.mts';
import { addingProperty, isPlainObject, keyName } from '../../support/objects.mts';
import { hasCommentIn, inserting, replacing, type FixPlan } from '../../support/ranges.mts';

const FINDERS = new Set(['find', 'findAndCount']);
const BLOCKING_KEYS = new Set(['select', 'join', 'loadRelationIds', 'relationLoadStrategy']);
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/u;
const RELATIONS = 'relations';

function nameOfElement(element: TSESTree.Node | undefined): string | undefined {
  return element?.type === AST_NODE_TYPES.Literal && typeof element.value === 'string'
    ? element.value
    : undefined;
}

function loadedNames(relations: TSESTree.Node | undefined): string[] | undefined {
  if (relations === undefined) {
    return [];
  }
  if (relations.type === AST_NODE_TYPES.ArrayExpression) {
    const names = relations.elements.map((element) => nameOfElement(element ?? undefined));
    return names.every((name) => name !== undefined) ? names : undefined;
  }
  if (isPlainObject(relations)) {
    const names = relations.properties.map((property) => keyName(property));
    return names.every((name) => name !== undefined) ? names : undefined;
  }
  return undefined;
}

function crowded(relation: Relation, loaded: readonly string[]): boolean {
  const { shape } = relation;
  if (shape === undefined) {
    return true;
  }
  if (!shape.many) {
    return false;
  }
  const otherMany = loaded.some((name) => name.includes('.') || shape.siblings.get(name) !== false);
  return shape.eagerMany || otherMany;
}

function arrayPlan(
  context: Context,
  relations: TSESTree.ArrayExpression,
  name: string,
): FixPlan | undefined {
  const last = relations.elements.at(-1);
  const quote = last === null || last === undefined ? "'" : context.sourceCode.getText(last)[0];
  const text = `${quote ?? "'"}${name}${quote ?? "'"}`;
  if (last === null || last === undefined) {
    return hasCommentIn(context.sourceCode, relations.range)
      ? undefined
      : replacing(relations.range, `[${text}]`);
  }
  return inserting(last.range[1], `, ${text}`);
}

function relationsPlan(
  context: Context,
  relations: TSESTree.Node,
  name: string,
): FixPlan | undefined {
  if (relations.type === AST_NODE_TYPES.ArrayExpression) {
    return arrayPlan(context, relations, name);
  }
  return isPlainObject(relations)
    ? addingProperty(context.sourceCode, relations, `${name}: true`)
    : undefined;
}

function optionsPlan(
  context: Context,
  options: TSESTree.ObjectExpression,
  name: string,
): FixPlan | undefined {
  const keys = options.properties.map((property) => keyName(property));
  if (keys.some((key) => key === undefined || BLOCKING_KEYS.has(key))) {
    return undefined;
  }
  const property = options.properties.find((each) => keyName(each) === RELATIONS);
  if (property === undefined) {
    return addingProperty(context.sourceCode, options, `${RELATIONS}: ['${name}']`);
  }
  return property.type === AST_NODE_TYPES.Property
    ? relationsPlan(context, property.value, name)
    : undefined;
}

function relationsOf(options: TSESTree.ObjectExpression): TSESTree.Node | undefined {
  const property = options.properties.find((each) => keyName(each) === RELATIONS);
  return property?.type === AST_NODE_TYPES.Property ? property.value : undefined;
}

export function lazyRelationFix(
  context: Context,
  query: QueryOrigin,
  relation: Relation,
): FixPlan | undefined {
  const { call, method, options: index } = query;
  const name = relation.relation;
  if (!FINDERS.has(method) || !IDENTIFIER.test(name) || call.arguments.length > index + 1) {
    return undefined;
  }
  if (call.arguments.some((argument) => argument.type === AST_NODE_TYPES.SpreadElement)) {
    return undefined;
  }
  const options = call.arguments[index];
  if (options === undefined) {
    return call.arguments.length === index && !crowded(relation, [])
      ? appendingArgument(context.sourceCode, call, `{ ${RELATIONS}: ['${name}'] }`)
      : undefined;
  }
  const loaded = isPlainObject(options) ? loadedNames(relationsOf(options)) : undefined;
  return !isPlainObject(options) || loaded === undefined || crowded(relation, loaded)
    ? undefined
    : optionsPlan(context, options, name);
}
