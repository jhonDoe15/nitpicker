import { staticKeyName } from '../analysis/static-shapes.mjs';
import { stringValue } from '../analysis/constant-resolution.mjs';
import {
  MIKRO_ORM,
  TYPEORM,
  objectOf,
  ormOf,
  propertiesOf,
  valueOf,
} from '../persistence/orm-bindings.mjs';

const RELATION = new Set(['ManyToOne']);
const PRIMARY = new Set(['PrimaryColumn', 'PrimaryGeneratedColumn', 'PrimaryKey']);
const VIEWS = new Set(['ViewEntity']);
const CLASS_INDEXES = new Set(['Index', 'Unique']);
const COLUMNS = new Set(['Column', 'Property']);
const JOIN_COLUMN = new Set(['JoinColumn']);
const NO_FOREIGN_KEY = new Map([
  [TYPEORM, 'createForeignKeyConstraints'],
  [MIKRO_ORM, 'createForeignKeyConstraint'],
]);
const MIKRO_COLUMN_KEYS = ['joinColumn', 'fieldName'];
const MIKRO_COLUMN_LISTS = ['joinColumns', 'fieldNames'];
const UPPER = /[A-Z]/gu;

function decoratorsOf(sourceCode, node, names) {
  return (node.decorators ?? []).flatMap((decorator) => {
    const call = decorator.expression;
    const found =
      call.type === 'CallExpression' ? ormOf(sourceCode, call.callee, names) : undefined;
    return found === undefined ? [] : [{ ...found, call }];
  });
}

function optionsOf(sourceCode, call) {
  const merged = new Map();
  for (const argument of call.arguments) {
    for (const [key, property] of propertiesOf(sourceCode, objectOf(sourceCode, argument))) {
      merged.set(key, valueOf(sourceCode, property.value));
    }
  }
  return merged;
}

function literalOf(value) {
  return value?.type === 'Literal' ? value.value : undefined;
}

function firstString(sourceCode, value) {
  const outer = valueOf(sourceCode, value);
  const node = outer?.type === 'ArrayExpression' ? valueOf(sourceCode, outer.elements[0]) : outer;
  if (node?.type === 'ObjectExpression') {
    return stringValue(valueOf(sourceCode, propertiesOf(sourceCode, node).get('name')?.value));
  }
  return stringValue(node);
}

function firstMember(node) {
  const body = node.body?.type === 'ArrayExpression' ? node.body.elements[0] : undefined;
  return body?.type === 'MemberExpression'
    ? staticKeyName(body.property, body.computed)
    : undefined;
}

function leadingColumn(sourceCode, call) {
  for (const argument of call.arguments.map((node) => valueOf(sourceCode, node))) {
    if (argument?.type === 'ArrayExpression') {
      return firstString(sourceCode, argument);
    }
    if (argument?.type === 'ArrowFunctionExpression') {
      return firstMember(argument);
    }
    const properties =
      argument?.type === 'ObjectExpression' ? propertiesOf(sourceCode, argument) : undefined;
    if (properties?.has('properties') === true) {
      return firstString(sourceCode, properties.get('properties').value);
    }
  }
  return undefined;
}

function snakeCase(name) {
  return name.replaceAll(UPPER, (letter) => `_${letter.toLowerCase()}`);
}

function joinColumnNames(sourceCode, member, relation) {
  const name = staticKeyName(member.key, member.computed);
  if (relation.orm === TYPEORM) {
    const joined = decoratorsOf(sourceCode, member, JOIN_COLUMN)[0]?.call.arguments[0];
    return [name, joined === undefined ? undefined : firstString(sourceCode, joined), `${name}Id`];
  }
  const keyed = [...MIKRO_COLUMN_KEYS, ...MIKRO_COLUMN_LISTS].map((key) =>
    relation.options.get(key),
  );
  const named = keyed.filter(Boolean).map((value) => firstString(sourceCode, value));
  return [name, ...named, `${snakeCase(name)}_id`];
}

function isPartial(sourceCode, call) {
  return call.arguments.some((argument) =>
    propertiesOf(sourceCode, objectOf(sourceCode, argument)).has('where'),
  );
}

function isTruthy(value) {
  const literal = literalOf(value);
  return literal === true || (typeof literal === 'string' && literal.length > 0);
}

function columnOptions(sourceCode, member) {
  const column =
    decoratorsOf(sourceCode, member, COLUMNS)[0] ?? decoratorsOf(sourceCode, member, RELATION)[0];
  return column === undefined ? new Map() : optionsOf(sourceCode, column.call);
}

function memberNames(sourceCode, member) {
  const relation = relationOf(sourceCode, member);
  if (relation !== undefined) {
    return joinColumnNames(sourceCode, member, relation).filter(Boolean);
  }
  const options = columnOptions(sourceCode, member);
  const name = staticKeyName(member.key, member.computed);
  return [name, stringValue(options.get('name') ?? options.get('fieldName'))].filter(Boolean);
}

function isPrimary(sourceCode, member) {
  return (
    decoratorsOf(sourceCode, member, PRIMARY).length > 0 ||
    literalOf(columnOptions(sourceCode, member).get('primary')) === true
  );
}

function isIndexedMember(sourceCode, member) {
  const options = columnOptions(sourceCode, member);
  const indexes = decoratorsOf(sourceCode, member, CLASS_INDEXES);
  return (
    indexes.some(({ call }) => !isPartial(sourceCode, call)) ||
    isTruthy(options.get('index')) ||
    isTruthy(options.get('unique'))
  );
}

function sharesName(sourceCode, other, names) {
  return memberNames(sourceCode, other).some((name) => names.has(name));
}

function isCovered(sourceCode, { member, classNode }) {
  const names = new Set(memberNames(sourceCode, member));
  const members = classNode.body.body;
  const primary = members.find((other) => isPrimary(sourceCode, other));
  if (primary !== undefined && sharesName(sourceCode, primary, names)) {
    return true;
  }
  const leading = decoratorsOf(sourceCode, classNode, CLASS_INDEXES)
    .filter(({ call }) => !isPartial(sourceCode, call))
    .map(({ call }) => leadingColumn(sourceCode, call));
  return (
    leading.some((name) => names.has(name)) ||
    members.some(
      (other) => sharesName(sourceCode, other, names) && isIndexedMember(sourceCode, other),
    )
  );
}

function relationOf(sourceCode, member) {
  const found = decoratorsOf(sourceCode, member, RELATION)[0];
  if (found === undefined || member.type !== 'PropertyDefinition') {
    return undefined;
  }
  const options = optionsOf(sourceCode, found.call);
  const persisted = literalOf(options.get('persist')) !== false;
  const constrained = literalOf(options.get(NO_FOREIGN_KEY.get(found.orm))) !== false;
  return persisted && constrained ? { ...found, options } : undefined;
}

export function unindexedRelations(sourceCode, classNode) {
  if (decoratorsOf(sourceCode, classNode, VIEWS).length > 0) {
    return [];
  }
  return classNode.body.body.flatMap((member) => {
    const relation = relationOf(sourceCode, member);
    if (relation === undefined || isCovered(sourceCode, { member, classNode })) {
      return [];
    }
    const property = staticKeyName(member.key, member.computed);
    return property === undefined ? [] : [{ node: relation.call, orm: relation.orm, property }];
  });
}
