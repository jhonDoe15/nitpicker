import { annotationIn, argumentOf, stringValue } from '../../spring-names.mts';
import { report } from '../../spring-scopes.mts';
import { FOREIGN_KEY_RULE } from '../../../../../jpa/foreign-keys/key-gate.mts';
import { simpleName } from '../../view/member-types.mts';
import { annotatedWith, membersOf } from '../entities.mts';
import {
  ENTITY,
  JOIN_COLUMN,
  JOIN_COLUMNS,
  MANY_TO_ONE,
  PRIMARY_KEY,
  SHARED_KEYS,
  TABLE,
} from '../data-types.mts';
import type {
  Annotation,
  ClassFact,
  Declaration,
  Member,
  Reported,
  RuleOptions,
  SourceFile,
  SpringView,
} from '../../typed/spring-shapes.mts';

type JoinArguments = {
  table?: string;
  unique?: string;
  name?: string;
  referencedColumnName?: string;
};
type JoinInfo = { covered?: true; name?: string | undefined; suffix?: string };

const MAX_ANCESTORS = 12;
const SPACING = /[_\s`"[\]]/gu;
const STRING = String.raw`"(?:[^"\\$]|\\.)*"`;
const INDEX_CALL = /\bIndex\s*\(/gu;
const COLUMN_LIST = new RegExp(String.raw`\bcolumnList\s*=\s*(${STRING})`, 'gu');
const UNIQUE_CALL = /\bUniqueConstraint\s*\(/gu;
const COLUMN_NAMES = new RegExp(
  String.raw`\bcolumnNames\s*=\s*(?:\[\s*|arrayOf\s*\(\s*)?(${STRING})`,
  'gu',
);
const ARRAY = /^\s*(?:\[|arrayOf\s*\()/u;
const RAW_STRING = '"""';
const NESTED_CALL = /\b\w+\s*\([^()]*\)/gu;
const CALL_START = /^[^(]*\(/u;
const NAMED_ARGUMENT = /^\s*(\w+)\s*=(.*)$/su;
const NO_CONSTRAINT = /\bNO_CONSTRAINT\b/u;
const OWN_TABLES = /\b(?:JOINED|TABLE_PER_CLASS)\b/u;

function normalized(name: string) {
  return name.replaceAll(SPACING, '').toLowerCase();
}

function firstColumn(list: string): string {
  return normalized((list.split(',')[0] ?? '').trim().split(/\s+/u)[0] ?? '');
}

function leadsOf(text: string | undefined, call: RegExp, values: RegExp): string[] | undefined {
  if (text === undefined) {
    return [];
  }
  if (text.includes(RAW_STRING)) {
    return undefined;
  }
  const found = [...text.matchAll(values)].map(([, literal]) => stringValue(literal) ?? '');
  const calls = [...text.matchAll(call)].length;
  return ARRAY.test(text) && found.length === calls ? found : undefined;
}

function tableLeads(view: SpringView, declared: ClassFact): string[] | undefined {
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

function joinFrom(args: JoinArguments, raw: string): JoinInfo {
  if (args.table !== undefined || args.unique === 'true' || NO_CONSTRAINT.test(raw)) {
    return { covered: true };
  }
  const name = args.name === undefined ? undefined : stringValue(args.name);
  const referenced =
    args.referencedColumnName === undefined ? 'id' : stringValue(args.referencedColumnName);
  if ((args.name !== undefined && name === undefined) || referenced === undefined) {
    return { covered: true };
  }
  return {
    name: name === undefined ? undefined : normalized(name),
    suffix: normalized(referenced),
  };
}

function argumentsIn(text: string): Record<string, string> {
  return Object.fromEntries(
    text
      .split(',')
      .map((part) => NAMED_ARGUMENT.exec(part))
      .filter((match) => match !== null)
      .map(([, name, value]): [string, string] => [name ?? '', (value ?? '').trim()]),
  );
}

function joinColumnOf(view: SpringView, member: Declaration): JoinInfo {
  const single = annotatedWith(view, member, JOIN_COLUMN);
  if (single !== undefined) {
    const named = single.arguments.filter(({ name }) => name !== undefined);
    const raw = single.arguments.map(({ text }) => text).join(',');
    return joinFrom(
      Object.fromEntries(named.map(({ name, text }): [string, string] => [name ?? '', text])),
      raw,
    );
  }
  const raw = annotatedWith(view, member, JOIN_COLUMNS)?.arguments[0]?.text ?? '';
  const first = raw.replace(CALL_START, '').replaceAll(NESTED_CALL, '').split(')')[0] ?? '';
  return joinFrom(argumentsIn(first), raw.split(')')[0] ?? '');
}

function firstKey(view: SpringView, members: Member[]): string | undefined {
  return members
    .filter((member) => annotatedWith(view, member, PRIMARY_KEY) !== undefined)
    .map(({ name }) => name)
    .reduce<string | undefined>(
      (first, name) => (first === undefined || name < first ? name : first),
      undefined,
    );
}

function isIndexed(
  member: Member,
  { leads, key, join }: { leads: string[]; key: string | undefined; join: JoinInfo },
): boolean {
  if (join.covered === true || member.name === key) {
    return true;
  }
  return leads.includes(join.name ?? `${normalized(member.name)}${String(join.suffix)}`);
}

function classesByName(projectFiles: SourceFile[]): Map<string, ClassFact> {
  return new Map(
    projectFiles.flatMap((file) =>
      file.classes.map((declared): [string, ClassFact] => [declared.name, declared]),
    ),
  );
}

function annotated(declared: ClassFact, name: string): Annotation | undefined {
  return declared.annotations.find(
    (annotation) => simpleName(annotation.type ?? annotation.name) === name,
  );
}

function sharesParentTable(classes: Map<string, ClassFact>, declared: ClassFact): boolean {
  const first = classes.get(simpleName(declared.superClass ?? ''));
  const pending = first === undefined ? [] : [first];
  let entityParent = false;
  for (const parent of pending) {
    const inheritance = annotated(parent, 'Inheritance');
    if (
      inheritance !== undefined &&
      inheritance.arguments.some(({ text }) => OWN_TABLES.test(text))
    ) {
      return false;
    }
    entityParent ||= annotated(parent, 'Entity') !== undefined;
    const next = classes.get(simpleName(parent.superClass ?? ''));
    if (next !== undefined && pending.length < MAX_ANCESTORS) {
      pending.push(next);
    }
  }
  return entityParent;
}

function entityKeys(
  view: SpringView,
  declared: ClassFact,
  classes: Map<string, ClassFact>,
): Reported[] {
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

function unindexedForeignKeys(
  view: SpringView,
  { projectFiles = [], checksForeignKeys }: Partial<RuleOptions>,
): Reported[] {
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
