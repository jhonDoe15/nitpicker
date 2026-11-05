import { staticKeyName } from '../analysis/static-shapes.mjs';
import {
  MIKRO_ORM,
  TYPEORM,
  importedName,
  importsOrm,
  objectOf,
  ormOf,
  propertiesOf,
  valueOf,
} from './orm-bindings.mjs';

export const MANY_TO_MANY = 'many-to-many';
const DECORATOR_KINDS = new Map([
  ['ManyToOne', 'many-to-one'],
  ['OneToOne', 'one-to-one'],
  ['OneToMany', 'one-to-many'],
  ['ManyToMany', MANY_TO_MANY],
]);
const BUILDER_KINDS = new Map([
  ['manyToOne', 'many-to-one'],
  ['oneToOne', 'one-to-one'],
  ['oneToMany', 'one-to-many'],
  ['manyToMany', MANY_TO_MANY],
]);
const SCHEMA_KINDS = new Map([
  ['many-to-one', 'many-to-one'],
  ['one-to-one', 'one-to-one'],
  ['one-to-many', 'one-to-many'],
  [MANY_TO_MANY, MANY_TO_MANY],
  ['m:1', 'many-to-one'],
  ['1:1', 'one-to-one'],
  ['1:m', 'one-to-many'],
  ['m:n', MANY_TO_MANY],
  ['MANY_TO_ONE', 'many-to-one'],
  ['ONE_TO_ONE', 'one-to-one'],
  ['ONE_TO_MANY', 'one-to-many'],
  ['MANY_TO_MANY', MANY_TO_MANY],
]);
const SCHEMA_CLASS = new Set(['EntitySchema']);
const SCHEMA_RELATIONS = new Map([
  [TYPEORM, { container: 'relations', kindKeys: ['type'] }],
  [MIKRO_ORM, { container: 'properties', kindKeys: ['kind', 'reference'] }],
]);
const BUILDER_OPTIONS = new Set(['eager', 'cascade']);

function cascadeValues(sourceCode, expression) {
  const value = valueOf(sourceCode, expression);
  return value.type === 'ArrayExpression'
    ? value.elements.filter(Boolean).map((element) => valueOf(sourceCode, element))
    : [value];
}

function isTrue(sourceCode, expression) {
  const value = valueOf(sourceCode, expression);
  return value?.type === 'Literal' && value.value === true;
}

function fromProperties(sourceCode, { orm, kind }, properties) {
  const eager = properties.get('eager');
  const cascade = properties.get('cascade');
  return {
    orm,
    kind,
    eager: eager !== undefined && isTrue(sourceCode, eager.value) ? eager : undefined,
    cascade:
      cascade === undefined
        ? undefined
        : { node: cascade, values: cascadeValues(sourceCode, cascade.value) },
  };
}

function mergedProperties(sourceCode, argumentsList) {
  const merged = new Map();
  for (const argument of argumentsList) {
    for (const [key, value] of propertiesOf(sourceCode, objectOf(sourceCode, argument))) {
      merged.set(key, value);
    }
  }
  return merged;
}

function decoratorRelation(sourceCode, call) {
  const found = ormOf(sourceCode, call.callee, DECORATOR_KINDS);
  if (found === undefined) {
    return [];
  }
  const kind = DECORATOR_KINDS.get(found.name);
  return [
    fromProperties(
      sourceCode,
      { orm: found.orm, kind },
      mergedProperties(sourceCode, call.arguments),
    ),
  ];
}

function schemaKind(value) {
  if (value.type === 'Literal') {
    return SCHEMA_KINDS.get(value.value);
  }
  if (value.type === 'TemplateLiteral' && value.expressions.length === 0) {
    return SCHEMA_KINDS.get(value.quasis[0].value.cooked);
  }
  return value.type === 'MemberExpression'
    ? SCHEMA_KINDS.get(staticKeyName(value.property, value.computed))
    : undefined;
}

function schemaEntries(sourceCode, orm, schema) {
  const shape = SCHEMA_RELATIONS.get(orm);
  const container = propertiesOf(sourceCode, objectOf(sourceCode, schema)).get(shape.container);
  const entries = propertiesOf(sourceCode, objectOf(sourceCode, container?.value));
  return [...entries.values()].flatMap((entry) => {
    const properties = propertiesOf(sourceCode, objectOf(sourceCode, entry.value));
    const kindProperty = shape.kindKeys.map((key) => properties.get(key)).find(Boolean);
    const kind = kindProperty === undefined ? undefined : schemaKind(kindProperty.value);
    return kind === undefined ? [] : [fromProperties(sourceCode, { orm, kind }, properties)];
  });
}

function schemaRelations(sourceCode, expression) {
  const found = ormOf(sourceCode, expression.callee, SCHEMA_CLASS);
  return found === undefined ? [] : schemaEntries(sourceCode, found.orm, expression.arguments[0]);
}

function memberCallName(call) {
  return call.type === 'CallExpression' && call.callee.type === 'MemberExpression'
    ? staticKeyName(call.callee.property, call.callee.computed)
    : undefined;
}

function builderKind(call) {
  const chain = [call.callee.object];
  for (const current of chain) {
    const name = memberCallName(current);
    if (BUILDER_KINDS.has(name)) {
      return BUILDER_KINDS.get(name);
    }
    if (name !== undefined) {
      chain.push(current.callee.object);
    }
  }
  return undefined;
}

function builderRelation(sourceCode, call) {
  const option = memberCallName(call);
  if (!BUILDER_OPTIONS.has(option) || !importsOrm(sourceCode, MIKRO_ORM)) {
    return [];
  }
  const kind = builderKind(call);
  if (kind === undefined) {
    return [];
  }
  const [first] = call.arguments;
  const node = call.callee.property;
  if (option === 'eager') {
    const eager = first === undefined || isTrue(sourceCode, first);
    return [{ orm: MIKRO_ORM, kind, eager: eager ? node : undefined, cascade: undefined }];
  }
  const values = call.arguments.flatMap((argument) => cascadeValues(sourceCode, argument));
  return [{ orm: MIKRO_ORM, kind, eager: undefined, cascade: { node, values } }];
}

export function relationsAt(sourceCode, node) {
  if (node.type === 'NewExpression') {
    return schemaRelations(sourceCode, node);
  }
  return [...decoratorRelation(sourceCode, node), ...builderRelation(sourceCode, node)];
}

export function cascadeName(sourceCode, value) {
  if (value.type === 'Literal') {
    return value.value === true ? 'true' : String(value.value);
  }
  if (value.type !== 'MemberExpression') {
    return undefined;
  }
  return importedName(sourceCode, value.object, MIKRO_ORM) === 'Cascade'
    ? staticKeyName(value.property, value.computed)?.toLowerCase()
    : undefined;
}
