import { parseExpenseLine } from './expense.js';
import type { Expense, ParsedLine } from './expense.js';

export type ImportError = { readonly line: number; readonly reason: string };

export type CsvImport = {
  readonly expenses: readonly Expense[];
  readonly errors: readonly ImportError[];
};

type Row = { readonly line: number; readonly result: ParsedLine };

const HEADER = 'date,amount,category,note';
const FIRST_ROW_LINE = 2;

function expenseOf({ result }: Row): readonly Expense[] {
  return result.kind === 'expense' ? [result.expense] : [];
}

function errorOf({ line, result }: Row): readonly ImportError[] {
  return result.kind === 'failure' ? [{ line, reason: result.reason }] : [];
}

export function importCsv(csv: string, today: string): CsvImport {
  const lines: readonly string[] = csv.split(/\r?\n/);
  if (lines[0] !== HEADER) {
    return { expenses: [], errors: [{ line: 1, reason: 'Invalid header' }] };
  }
  const rows: readonly Row[] = lines
    .slice(1)
    .flatMap((text, index): readonly Row[] =>
      text.trim() === ''
        ? []
        : [{ line: index + FIRST_ROW_LINE, result: parseExpenseLine(text, today) }],
    );
  return { expenses: rows.flatMap(expenseOf), errors: rows.flatMap(errorOf) };
}
