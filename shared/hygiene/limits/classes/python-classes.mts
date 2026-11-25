import { leadingSpaces } from '../../../conventions/lines.mts';
import { makeFact } from '../scanning/facts.mts';
import { blankComments, lineAt } from '../scanning/scan.mts';
import { patternLength } from '../scanning/pattern-length.mts';
import type { Bounds, Fact } from '../fact-types.mts';

type Statement = { text: string; readonly line: number };
type ClassBody = {
  readonly name: string;
  readonly bases: string;
  readonly start: number;
  readonly bodyLines: readonly string[];
};

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

function numberFrom(pattern: RegExp, text: string): number | undefined {
  const found = pattern.exec(text)?.[1];
  return found === undefined ? undefined : Number(found);
}

function appendContinuation(last: Statement | undefined, line: string): void {
  if (last !== undefined) {
    last.text += ` ${line.trim()}`;
  }
}

function statementsOf(lines: readonly string[], startLine: number): Statement[] {
  const firstLine = lines.find((line) => line.trim() !== '');
  const indent = firstLine === undefined ? 0 : leadingSpaces(firstLine);
  const statements: Statement[] = [];
  let open = 0;
  for (const [offset, line] of lines.entries()) {
    if (open === 0 && line.trim() !== '' && leadingSpaces(line) === indent) {
      statements.push({ text: line.trim(), line: startLine + offset });
    } else if (open > 0) {
      appendContinuation(statements.at(-1), line);
    }
    open += (line.match(/[([{]/gu)?.length ?? 0) - (line.match(/[)\]}]/gu)?.length ?? 0);
    open = Math.max(open, 0);
  }
  return statements;
}

function classBodies(text: string): ClassBody[] {
  const lines = text.split(/\r?\n/u);
  return [...text.matchAll(CLASS)].map((match) => {
    const start = lineAt(text, match.index);
    const bodyLines: string[] = [];
    for (const line of lines.slice(start)) {
      if (line.trim() !== '' && leadingSpaces(line) <= (match[1] ?? '').length) {
        break;
      }
      bodyLines.push(line);
    }
    return { name: match[2] ?? '', bases: match[3] ?? '', start, bodyLines };
  });
}

function patternBounds(text: string): { readonly min?: number; readonly max?: number } {
  const regex = PATTERN.exec(text)?.[2];
  return regex === undefined ? {} : (patternLength(regex) ?? {});
}

export function pythonFacts(file: string, source: string): Fact[] {
  const text = blankComments(source, { hash: true });
  return classBodies(text).flatMap((entity) => {
    const statements = statementsOf(entity.bodyLines, entity.start + 1);
    const table = statements
      .map(({ text: statement }) => TABLE.exec(statement)?.[1] ?? DB_TABLE.exec(statement)?.[1])
      .find((name) => name !== undefined);
    const isTable = entity.bases.includes('SQLModel') && /table\s*=\s*True/u.test(entity.bases);
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
      const bounds: Bounds = validated
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

function finite(bounds: Bounds): Bounds {
  return {
    ...bounds,
    max: Number.isFinite(bounds.max) ? bounds.max : undefined,
    min: bounds.min !== undefined && bounds.min > 0 ? bounds.min : undefined,
  };
}
