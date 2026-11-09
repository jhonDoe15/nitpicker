import { annotationIn, argumentOf, stringValue } from '../../spring-names.mjs';
import { entriesOf, report } from '../../spring-scopes.mjs';
import { simpleName } from '../../view/member-types.mjs';
import { annotatedWith, membersOf } from '../entities.mjs';
import {
  ENTITY,
  JOIN_COLUMN,
  JOIN_COLUMNS,
  MANY_TO_ONE,
  PRIMARY_KEY,
  SHARED_KEYS,
  TABLE,
} from '../data-types.mjs';

export const FOREIGN_KEY_RULE = 'JpaUnindexedForeignKey';

const MAX_ANCESTORS = 12;
const SPACING = /[_\s`"[\]]/gu;
const STRING = String.raw`"(?:[^"\\$]|\\.)*"`;
const INDEX_CALL = /\bIndex\s*\(/gu;
const COLUMN_LIST = new RegExp(String.raw`\bcolumnList\s*=\s*(${STRING})`, 'gu');
const UNIQUE_CALL = /\bUniqueConstraint\s*\(/gu;
const COLUMN_NAMES = new RegExp(
  String.raw`\bcolumnNames\s*=\s*(?:\[|arrayOf\s*\()?\s*(${STRING})`,
  'gu',
);
const ARRAY = /^\s*(?:\[|arrayOf\s*\()/u;
const JOIN_NAME = /\bname\s*=\s*([^,)]+)/u;
const OWN_TABLES = /\b(?:JOINED|TABLE_PER_CLASS)\b/u;

function normalized(name) {
  return name.replaceAll(SPACING, '').toLowerCase();
}

function firstColumn(list) {
  return normalized(list.split(',')[0].trim().split(/\s+/u)[0]);
}

function leadsOf(text, call, values) {
  if (text === undefined) {
    return [];
  }
  const found = [...text.matchAll(values)].map(([, literal]) => stringValue(literal));
  const calls = [...text.matchAll(call)].length;
  return ARRAY.test(text) && found.length === calls ? found : undefined;
}

function tableLeads(view, declared) {
  const table = annotationIn(view.resolve, declared.annotations, TABLE);
  if (table === undefined) {
    return [];
  }
  const indexes = leadsOf(argumentOf(table, 'indexes'), INDEX_CALL, COLUMN_LIST);
  const uniques = leadsOf(argumentOf(table, 'uniqueConstraints'), UNIQUE_CALL, COLUMN_NAMES);
  return indexes === undefined || uniques === undefined
    ? undefined
    : [...indexes.map(firstColumn), ...uniques.map(normalized)];
}

function joinColumnOf(view, member) {
  const single = annotatedWith(view, member, JOIN_COLUMN);
  if (single !== undefined) {
    return argumentOf(single, 'unique') === 'true'
      ? { unique: true }
      : columnFrom(argumentOf(single, 'name'));
  }
  const several = annotatedWith(view, member, JOIN_COLUMNS);
  const first = several?.arguments[0]?.text.split(')')[0] ?? '';
  return columnFrom(JOIN_NAME.exec(first)?.[1]);
}

function columnFrom(text) {
  if (text === undefined) {
    return {};
  }
  const name = stringValue(text);
  return name === undefined ? { unknown: true } : { name: normalized(name) };
}

function firstKey(view, members) {
  return members
    .filter((member) => annotatedWith(view, member, PRIMARY_KEY) !== undefined)
    .map(({ name }) => name)
    .toSorted()[0];
}

function isIndexed(member, { leads, key, join }) {
  if (join.unknown === true || join.unique === true || member.name === key) {
    return true;
  }
  const field = normalized(member.name);
  return leads.some((lead) =>
    join.name === undefined ? lead.startsWith(field) : lead === join.name,
  );
}

function classesByName(projectFiles) {
  return new Map(
    projectFiles.flatMap((file) => file.classes.map((declared) => [declared.name, declared])),
  );
}

function annotated(declared, name) {
  return declared.annotations.find(
    (annotation) => simpleName(annotation.type ?? annotation.name) === name,
  );
}

function sharesParentTable(classes, declared) {
  const pending = [classes.get(simpleName(declared.superClass ?? ''))];
  let entityParent = false;
  for (const parent of pending.filter((found) => found !== undefined)) {
    const inheritance = annotated(parent, 'Inheritance');
    if (
      inheritance !== undefined &&
      inheritance.arguments.some(({ text }) => OWN_TABLES.test(text))
    ) {
      return false;
    }
    entityParent ||= annotated(parent, 'Entity') !== undefined;
    if (pending.length < MAX_ANCESTORS && parent.superClass !== undefined) {
      pending.push(classes.get(simpleName(parent.superClass)));
    }
  }
  return entityParent;
}

function entityKeys(view, declared, classes) {
  const leads = tableLeads(view, declared);
  if (leads === undefined || sharesParentTable(classes, declared)) {
    return [];
  }
  const members = membersOf(view, declared);
  const key = firstKey(view, members);
  return members
    .filter((member) => annotatedWith(view, member, MANY_TO_ONE) !== undefined)
    .filter((member) => annotatedWith(view, member, SHARED_KEYS) === undefined)
    .filter((member) => !isIndexed(member, { leads, key, join: joinColumnOf(view, member) }))
    .map((member) => report(FOREIGN_KEY_RULE, member, `${declared.qualified}.${member.name}`));
}

function unindexedForeignKeys(view, { projectFiles = [], checksForeignKeys }) {
  const entities = view.file.classes.filter(
    (declared) => annotationIn(view.resolve, declared.annotations, ENTITY) !== undefined,
  );
  if (entities.length === 0 || checksForeignKeys?.(view.file.file) === false) {
    return [];
  }
  const classes = classesByName([view.file, ...projectFiles]);
  return entities.flatMap((declared) => entityKeys(view, declared, classes));
}

export const FOREIGN_KEY_RULES = [unindexedForeignKeys];
