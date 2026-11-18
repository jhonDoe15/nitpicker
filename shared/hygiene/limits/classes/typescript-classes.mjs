import { closingIndex, lineAt, topLevelText } from '../scanning/scan.mjs';
import { isEnumField } from '../scanning/enum-names.mjs';
import { fieldFacts } from './field-facts.mjs';
import {
  classesIn,
  declarationPattern,
  fieldsWithAncestors,
  scanDeclarations,
  trailingAnnotations,
} from './declarations.mjs';

const CLASS = /\bclass\s+(\w+)\b([^{]*)\{/gu;
const EXTENDS = /\bextends\s+(\w+)/u;
const FIELD = declarationPattern(
  'private|protected|public|readonly|declare|static',
  String.raw`(?<name>\w+)[!?]?\s*:\s*(?<type>[\w.]+)[^;=\n]*(?:=|;|\n|$)`,
);
const COLUMN_DECORATORS = new Set(['Column', 'Property', 'Field']);
const STRING_COLUMN = /DataType\.STRING\(\s*(\d+)/u;
const TEXT_TYPE = /^string$/u;

export function isTypescriptFile(file) {
  return /\.(?:ts|tsx|mts|cts)$/u.test(file);
}

const LENGTH_OPTION = /\blength\s*:\s*(\d+)/u;
const TABLE_OPTION = /\b(?:tableName|name)\s*:\s*['"](\w+)['"]/u;

function lengthOf(annotation) {
  const found = LENGTH_OPTION.exec(annotation.raw)?.[1] ?? STRING_COLUMN.exec(annotation.raw)?.[1];
  return found === undefined ? undefined : Number(found);
}

function classRecord(file, text, match) {
  const open = match.index + match[0].length - 1;
  const end = closingIndex(text, open);
  const annotations = trailingAnnotations(text, match.index);
  const fields = scanDeclarations(
    topLevelText(text.slice(open + 1, end)),
    FIELD,
    lineAt(text, open + 1),
  ).map((field) => ({ ...field, file }));
  return { name: match[1], parent: EXTENDS.exec(match[2])?.[1], annotations, fields, file };
}

export function typescriptClasses(file, source) {
  return classesIn({ file, source, pattern: CLASS, build: classRecord });
}

function tableOf(entity) {
  const decorator = entity.annotations.find(({ name }) => name === 'Entity' || name === 'Table');
  const first = decorator?.args.positional[0];
  return typeof first === 'string' ? first : TABLE_OPTION.exec(decorator?.raw ?? '')?.[1];
}

function fieldFactsOf(entity, field, enums) {
  const column = field.annotations.find(({ name }) => COLUMN_DECORATORS.has(name));
  const length = column === undefined ? undefined : lengthOf(column);
  return fieldFacts({
    entity,
    field,
    table: tableOf(entity),
    style: 'typescript',
    enumerated: isEnumField(field, enums),
    stored: entity.annotations.some(({ name }) => name === 'Entity' || name === 'Table'),
    width: TEXT_TYPE.test(field.type) ? length : undefined,
  });
}

export function typescriptFacts(classes, enums = new Set()) {
  const byName = new Map(classes.map((entity) => [entity.name, entity]));
  return classes.flatMap((entity) =>
    fieldsWithAncestors(entity, byName).flatMap((field) => fieldFactsOf(entity, field, enums)),
  );
}
