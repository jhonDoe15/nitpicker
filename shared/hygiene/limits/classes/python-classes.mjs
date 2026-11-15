import { makeFact } from '../scanning/facts.mjs';
import { blankComments, lineAt } from '../scanning/scan.mjs';
import { patternLength } from '../scanning/pattern-length.mjs';

const CLASS = /^([ \t]*)class\s+(\w+)\s*(?:\(([^)]*)\)\s*)?:/gmu;
const TABLE = /^__tablename__\s*=\s*['"](\w+)['"]/u;
const DB_TABLE = /\bdb_table\s*=\s*['"](\w+)['"]/u;
const STATEMENT = /^(\w+)\s*[:=]/u;
const STRING_COLUMN = /\b(?:String|Unicode|CHAR|VARCHAR|NVARCHAR)\(\s*(?:length\s*=\s*)?(\d+)/u;
const ORM_COLUMN = /\b(?:Column|mapped_column)\(/u;
const DJANGO_COLUMN = /\b(?:Char|Email|Slug|URL)Field\(/u;
const MAX_LENGTH = /\bmax_length\s*=\s*(\d+)/u;
const MIN_LENGTH = /\bmin_length\s*=\s*(\d+)/u;
const PATTERN = /\b(?:pattern|regex)\s*=\s*r?(["'])(.+?)\1/u;
const LE = /\ble\s*=\s*(\d+)/u;
const VALIDATOR_CALL = /\b(?:Field|constr|StringConstraints|conint)\(/u;

function numberFrom(pattern, text) {
  const found = pattern.exec(text)?.[1];
  return found === undefined ? undefined : Number(found);
}

function statementsOf(lines, startLine) {
  const indent = lines.find((line) => line.trim() !== '')?.match(/^\s*/u)[0].length ?? 0;
  const statements = [];
  let open = 0;
  for (const [offset, line] of lines.entries()) {
    if (open === 0 && line.trim() !== '' && line.match(/^\s*/u)[0].length === indent) {
      statements.push({ text: line.trim(), line: startLine + offset });
    } else if (statements.length > 0 && open > 0) {
      statements.at(-1).text += ` ${line.trim()}`;
    }
    open += (line.match(/[([{]/gu)?.length ?? 0) - (line.match(/[)\]}]/gu)?.length ?? 0);
    open = Math.max(open, 0);
  }
  return statements;
}

function classBodies(text) {
  const lines = text.split('\n');
  return [...text.matchAll(CLASS)].map((match) => {
    const start = lineAt(text, match.index);
    const bodyLines = [];
    for (const line of lines.slice(start)) {
      if (line.trim() !== '' && line.match(/^\s*/u)[0].length <= match[1].length) {
        break;
      }
      bodyLines.push(line);
    }
    return { name: match[2], bases: match[3] ?? '', start, bodyLines };
  });
}

function patternBounds(text) {
  const regex = PATTERN.exec(text)?.[2];
  return regex === undefined ? {} : (patternLength(regex) ?? {});
}

export function pythonFacts(file, source) {
  const text = blankComments(source, { hash: true });
  return classBodies(text).flatMap((entity) => {
    const statements = statementsOf(entity.bodyLines, entity.start + 1);
    const table = statements
      .map(({ text: statement }) => TABLE.exec(statement)?.[1] ?? DB_TABLE.exec(statement)?.[1])
      .find(Boolean);
    const isTable = /SQLModel/u.test(entity.bases) && /table\s*=\s*True/u.test(entity.bases);
    return statements.flatMap(({ text: statement, line }) => {
      const field = STATEMENT.exec(statement)?.[1];
      if (field === undefined || field.startsWith('__')) {
        return [];
      }
      const names = {
        entityNames: [entity.name, table],
        fieldNames: [field],
        label: `${entity.name}.${field}`,
        file,
        line,
        style: 'python',
      };
      const orm = ORM_COLUMN.test(statement) ? numberFrom(STRING_COLUMN, statement) : undefined;
      const django = DJANGO_COLUMN.test(statement) ? numberFrom(MAX_LENGTH, statement) : undefined;
      const validated = VALIDATOR_CALL.test(statement) && !DJANGO_COLUMN.test(statement);
      const max = validated ? numberFrom(MAX_LENGTH, statement) : undefined;
      const bounds = validated
        ? {
            max: Math.min(max ?? Infinity, patternBounds(statement).max ?? Infinity),
            min: numberFrom(MIN_LENGTH, statement) ?? patternBounds(statement).min,
            maximum: numberFrom(LE, statement),
          }
        : {};
      const width = orm ?? django ?? (isTable ? max : undefined);
      const stored = ORM_COLUMN.test(statement) || DJANGO_COLUMN.test(statement);
      return [
        ...(stored ? [makeFact({ ...names, kind: 'field' })] : []),
        ...(width === undefined ? [] : [makeFact({ ...names, kind: 'column', width })]),
        ...(validated ? [makeFact({ ...names, kind: 'validation', bounds: finite(bounds) })] : []),
      ];
    });
  });
}

function finite(bounds) {
  return {
    ...bounds,
    max: Number.isFinite(bounds.max) ? bounds.max : undefined,
    min: bounds.min > 0 ? bounds.min : undefined,
  };
}
