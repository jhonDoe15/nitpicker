import { lineAt } from '../scanning/scan.mts';
import type { ColumnDeclaration, PendingColumn } from '../fact-types.mts';

const XML_TABLE = /<(createTable|addColumn)\s([^>]*)>([\s\S]*?)<\/\1>/gu;
const XML_COLUMN = /<column\s([^>]*)>/gu;
const XML_MODIFY = /<modifyDataType\s([^>]*)>/gu;
const XML_ATTRIBUTE = /([\w:-]+)\s*=\s*"([^"]*)"/gu;
const XML_WIDTH = /^\s*(?:n?varchar2?|n?char|string)\s*\(\s*(\d+)/iu;
const ALEMBIC_STEP =
  /\bop\.(create_table|add_column|alter_column)\(\s*['"](\w+)['"],?([\s\S]*?)(?=\bop\.\w+\(|$)/gu;
const ALEMBIC_TYPE =
  /\b(?:sa\.|sqlalchemy\.)?(?:String|Unicode|CHAR|VARCHAR|NVARCHAR)\(\s*(?:length\s*=\s*)?(\d+)\s*\)/u;
const ALEMBIC_COLUMN = /Column\(\s*['"](\w+)['"]\s*,([^\n]*)/gu;
const ALEMBIC_ALTER = /^\s*['"](\w+)['"]([\s\S]*)$/u;

function width(pattern: RegExp, text: string): number | undefined {
  const found = pattern.exec(text)?.[1];
  return found === undefined ? undefined : Number(found);
}

function attributesOf(tag: string): Map<string, string> {
  return new Map(
    [...tag.matchAll(XML_ATTRIBUTE)].map(([, name, value]): [string, string] => [
      name ?? '',
      value ?? '',
    ]),
  );
}

function tableOf(attributes: ReadonlyMap<string, string>): string | undefined {
  return attributes.get('tableName')?.split('.').at(-1);
}

export function xmlColumns(file: string, text: string): ColumnDeclaration[] {
  const created = [...text.matchAll(XML_TABLE)].flatMap((table): PendingColumn[] => {
    const tableName = tableOf(attributesOf(table[2] ?? ''));
    const content = table[3] ?? '';
    const contentStart = table.index + table[0].indexOf(content);
    return [...content.matchAll(XML_COLUMN)].map((column) => {
      const attributes = attributesOf(column[1] ?? '');
      return {
        table: tableName,
        column: attributes.get('name'),
        width: width(XML_WIDTH, attributes.get('type') ?? ''),
        file,
        line: lineAt(text, contentStart + column.index),
      };
    });
  });
  const modified = [...text.matchAll(XML_MODIFY)].map((modify): PendingColumn => {
    const attributes = attributesOf(modify[1] ?? '');
    return {
      table: tableOf(attributes),
      column: attributes.get('columnName'),
      width: width(XML_WIDTH, attributes.get('newDataType') ?? ''),
      file,
      line: lineAt(text, modify.index),
    };
  });
  return [...created, ...modified].flatMap(({ table, column, width: size, file: source, line }) =>
    table && column ? [{ table, column, width: size, file: source, line }] : [],
  );
}

export function alembicColumns(file: string, text: string): ColumnDeclaration[] {
  return [...text.matchAll(ALEMBIC_STEP)].flatMap((step): ColumnDeclaration[] => {
    const [, operation, table = '', rest = ''] = step;
    const line = lineAt(text, step.index);
    if (operation === 'alter_column') {
      const altered = ALEMBIC_ALTER.exec(rest);
      const alteredText = altered?.[2] ?? '';
      return altered === null || !/\btype_\s*=/u.test(alteredText)
        ? []
        : [
            {
              table,
              column: altered[1] ?? '',
              width: width(ALEMBIC_TYPE, alteredText),
              file,
              line,
            },
          ];
    }
    return [...rest.matchAll(ALEMBIC_COLUMN)].map((column) => ({
      table,
      column: column[1] ?? '',
      width: width(ALEMBIC_TYPE, column[2] ?? ''),
      file,
      line,
    }));
  });
}
