import { fieldFacts } from './field-facts.mjs';
import { closingIndex, lineAt, splitTopLevel, topLevelText } from '../scanning/scan.mjs';
import {
  classesIn,
  declarationPattern,
  fieldsWithAncestors,
  scanDeclarations,
  trailingAnnotations,
} from './declarations.mjs';

const JVM_FILE = /\.(?:java|kt)$/u;
const CLASS = /(?<![.\w])(?:class|record)\s+(\w+)/gu;
const HEADER = /[^{\n]*(?:\n[ \t]*(?:extends|implements|permits|:|,|where)[^{\n]*)*/uy;
const PARENT = /(?:\bextends\s+|:\s*)([\w.]+)/u;
const JAVA_MODIFIERS = 'private|protected|public|static|final|transient|volatile';
const KOTLIN_MODIFIERS = 'private|protected|public|override|open|lateinit|internal';
const JAVA_FIELD = declarationPattern(
  JAVA_MODIFIERS,
  String.raw`(?<type>[\w.]+(?:<[^;=(){}]*>)?(?:\[\])?)\s+(?<name>\w+)\s*(?:=|;)`,
);
const KOTLIN_FIELD = declarationPattern(
  KOTLIN_MODIFIERS,
  String.raw`(?:val|var)\s+(?<name>\w+)\s*:\s*(?<type>[\w.]+)`,
);
const RECORD_PARAM = /(?<type>[\w.]+(?:<[^,]*>)?(?:\[\])?)\s+(?<name>\w+)\s*$/uy;
const STORED = new Set(['Entity', 'MappedSuperclass']);
const TEXT_TYPE = /^(?:String|CharSequence)$/u;

export function isJvmFile(file) {
  return JVM_FILE.test(file);
}

function classAt(file, text, match) {
  const nameEnd = match.index + match[0].length;
  const generics = text[nameEnd] === '<' ? text.indexOf('>', nameEnd) + 1 : nameEnd;
  const hasConstructor = text[generics] === '(';
  const constructorEnd = hasConstructor ? closingIndex(text, generics) : generics - 1;
  HEADER.lastIndex = constructorEnd + 1;
  const header = HEADER.exec(text)[0];
  const bodyOpen = text[HEADER.lastIndex] === '{' ? HEADER.lastIndex : -1;
  const bodyEnd = bodyOpen === -1 ? -1 : closingIndex(text, bodyOpen);
  const kotlin = file.endsWith('.kt');
  const annotations = trailingAnnotations(text, match.index);
  const parameters = hasConstructor ? text.slice(generics + 1, constructorEnd) : '';
  const parameterFields = splitTopLevel(parameters).flatMap(({ text: part, offset }) =>
    scanDeclarations(
      part,
      kotlin ? KOTLIN_FIELD : RECORD_PARAM,
      lineAt(text, generics + 1 + offset),
    ),
  );
  const bodyFields =
    bodyOpen === -1
      ? []
      : scanDeclarations(
          topLevelText(text.slice(bodyOpen + 1, bodyEnd)),
          kotlin ? KOTLIN_FIELD : JAVA_FIELD,
          lineAt(text, bodyOpen + 1),
        );
  return {
    name: match[1],
    file,
    parent: PARENT.exec(header)?.[1]?.split('.').at(-1),
    annotations,
    fields: [...parameterFields, ...bodyFields].map((field) => ({
      ...field,
      type: (field.type ?? '').replace('?', ''),
    })),
  };
}

export function jvmClasses(file, source) {
  return classesIn({ file, source, pattern: CLASS, build: classAt });
}

function tableOf(entity) {
  return entity.annotations.find(({ name }) => name === 'Table')?.args.named.get('name');
}

function isBoundedColumn(field, column) {
  const readOnly =
    column.named.get('insertable') === false || column.named.get('updatable') === false;
  const lob = field.annotations.some(({ name }) => name === 'Lob');
  return !readOnly && !lob && !column.named.has('columnDefinition') && TEXT_TYPE.test(field.type);
}

function fieldFactsOf(entity, field) {
  const column = field.annotations.find(({ name }) => name === 'Column')?.args;
  const length = column?.named.get('length');
  return fieldFacts({
    entity,
    field,
    table: tableOf(entity),
    style: 'jvm',
    stored: entity.annotations.some(({ name }) => STORED.has(name)),
    columnName: column?.named.get('name'),
    width: typeof length === 'number' && isBoundedColumn(field, column) ? length : undefined,
  });
}

export function jvmFacts(classes) {
  const byName = new Map(classes.map((entity) => [entity.name, entity]));
  return classes.flatMap((entity) =>
    fieldsWithAncestors(entity, byName).flatMap((field) => fieldFactsOf(entity, field)),
  );
}
