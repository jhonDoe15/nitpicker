import type TypeScript from 'typescript';
import { descendantsOf, ts } from '../typed/typescript-views.mts';

const OWNER_WORDS =
  'organization|org|environment|team|user|subscriber|tenant|project|workspace|account|owner|' +
  'customer|company|creator';
const OWNER = new RegExp(`^_?(?:${OWNER_WORDS})(?:_?id)?$`, 'iu');
const ID = /(?:^|_)id$|Id$|^uuid$/u;

export function isOwnerField(name: string): boolean {
  return OWNER.test(name);
}

export function isIdField(name: string): boolean {
  return ID.test(name) && !OWNER.test(name);
}

export function fieldKey(name: string): string {
  return name.toLowerCase().replaceAll('_', '');
}

export type Site = {
  readonly call: TypeScript.CallExpression;
  readonly model: string;
  readonly label: string;
  readonly filter: TypeScript.ObjectLiteralExpression;
  readonly entries: readonly Entry[];
};
type Entry = { readonly name: string; readonly value: TypeScript.Expression | undefined };

const METHODS = new Set([
  'find',
  'findOne',
  'findFirst',
  'findUnique',
  'findFirstOrThrow',
  'findUniqueOrThrow',
  'findOneOrFail',
  'findOneBy',
  'findOneAndUpdate',
  'findOneAndDelete',
  'update',
  'updateOne',
  'updateMany',
  'delete',
  'deleteOne',
  'deleteMany',
]);
const OPTION_KEYS = new Set([
  'data',
  'select',
  'include',
  'orderBy',
  'order',
  'take',
  'skip',
  'cursor',
  'relations',
]);
const COMBINATORS = new Set(['AND', 'OR', 'NOT', '$and', '$or', '$nor', '$not']);
const WHERE = 'where';

function nameOfKey(name: TypeScript.PropertyName): string | undefined {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : undefined;
}

function entriesOf(filter: TypeScript.ObjectLiteralExpression): Entry[] | undefined {
  const entries: Entry[] = [];
  for (const property of filter.properties) {
    const name =
      ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)
        ? nameOfKey(property.name)
        : undefined;
    if (name === undefined || COMBINATORS.has(name)) {
      return undefined;
    }
    if (ts.isPropertyAssignment(property)) {
      entries.push({ name, value: property.initializer });
    } else if (ts.isShorthandPropertyAssignment(property)) {
      entries.push({ name, value: property.name });
    }
  }
  return entries.length === 0 ? undefined : entries;
}

function filterOf(argument: TypeScript.Expression): TypeScript.ObjectLiteralExpression | undefined {
  if (!ts.isObjectLiteralExpression(argument)) {
    return undefined;
  }
  const where = argument.properties.find(
    (property): property is TypeScript.PropertyAssignment =>
      ts.isPropertyAssignment(property) && nameOfKey(property.name) === WHERE,
  );
  if (where !== undefined) {
    return ts.isObjectLiteralExpression(where.initializer) ? where.initializer : undefined;
  }
  const hasOptions = argument.properties.some(
    (property) =>
      ts.isPropertyAssignment(property) && OPTION_KEYS.has(nameOfKey(property.name) ?? ''),
  );
  return hasOptions ? undefined : argument;
}

function modelOf(receiver: TypeScript.Expression): string | undefined {
  if (ts.isIdentifier(receiver)) {
    return receiver.text;
  }
  return ts.isPropertyAccessExpression(receiver) ? receiver.name.text : undefined;
}

function siteOf(node: TypeScript.Node): Site | undefined {
  if (!(ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression))) {
    return undefined;
  }
  const { expression } = node;
  const [argument] = node.arguments;
  const model = modelOf(expression.expression);
  const filter = argument === undefined ? undefined : filterOf(argument);
  const entries = filter === undefined ? undefined : entriesOf(filter);
  const found = METHODS.has(expression.name.text) && model !== undefined;
  return found && filter !== undefined && entries !== undefined
    ? { call: node, model: model.toLowerCase(), label: model, filter, entries }
    : undefined;
}

export function sitesIn(sourceFile: TypeScript.SourceFile): Site[] {
  return descendantsOf(sourceFile)
    .map(siteOf)
    .filter((site) => site !== undefined);
}
