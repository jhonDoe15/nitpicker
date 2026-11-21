import { closingIndex, lineAt, topLevelText } from '../scanning/scan.mts';
import { isEnumField } from '../scanning/enum-names.mts';
import { fieldFacts } from './field-facts.mts';
import {
  classesIn,
  declarationPattern,
  classFacts,
  scanDeclarations,
  trailingAnnotations,
} from './declarations.mts';
import type { Annotation, ClassRecord, Fact, LocatedField } from '../fact-types.mts';

const CLASS = /\bclass\s+(\w+)\b([^{]*)\{/gu;
const EXTENDS = /\bextends\s+(\w+)/u;
const FIELD = declarationPattern(
  /private|protected|public|readonly|declare|static/u,
  String.raw`(?<name>\w+)[!?]?\s*:\s*(?<type>[\w.]+)[^;=\n]*(?:=|;|\n|$)`,
);
const COLUMN_DECORATORS = new Set(['Column', 'Property', 'Field']);
const STRING_COLUMN = /DataType\.STRING\(\s*(\d+)/u;
const TEXT_TYPE = /^string$/u;

export function isTypescriptFile(file: string): boolean {
  return /\.(?:ts|tsx|mts|cts)$/u.test(file);
}

const LENGTH_OPTION = /\blength\s*:\s*(\d+)/u;
const TABLE_OPTION = /\b(?:tableName|name)\s*:\s*['"](\w+)['"]/u;

function lengthOf(annotation: Annotation): number | undefined {
  const found = LENGTH_OPTION.exec(annotation.raw)?.[1] ?? STRING_COLUMN.exec(annotation.raw)?.[1];
  return found === undefined ? undefined : Number(found);
}

function classRecord(file: string, text: string, match: RegExpExecArray): ClassRecord {
  const open = match.index + match[0].length - 1;
  const end = closingIndex(text, open);
  const annotations = trailingAnnotations(text, match.index);
  const fields = scanDeclarations(
    topLevelText(text.slice(open + 1, end)),
    FIELD,
    lineAt(text, open + 1),
  );
  return {
    name: match[1] ?? '',
    parent: EXTENDS.exec(match[2] ?? '')?.[1],
    annotations,
    fields,
    file,
  };
}

export function typescriptClasses(file: string, source: string): ClassRecord[] {
  return classesIn({ file, source, pattern: CLASS, build: classRecord });
}

function tableOf(entity: ClassRecord): string | undefined {
  const decorator = entity.annotations.find(({ name }) => name === 'Entity' || name === 'Table');
  const first = decorator?.args.positional[0];
  return typeof first === 'string' ? first : TABLE_OPTION.exec(decorator?.raw ?? '')?.[1];
}

function fieldFactsOf(
  entity: ClassRecord,
  field: LocatedField,
  enums: ReadonlySet<string>,
): Fact[] {
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

export function typescriptFacts(
  classes: readonly ClassRecord[],
  enums: ReadonlySet<string> = new Set(),
): Fact[] {
  return classFacts(classes, enums, fieldFactsOf);
}
