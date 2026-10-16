import { isValidDate } from '../../calendar/index.js';
import { splitLine } from '../../csv/index.js';
import type { SplitResult } from '../../csv/index.js';
import { parseCents } from '../../money/index.js';

export type Expense = {
  readonly date: string;
  readonly amountCents: number;
  readonly category: string;
  readonly note: string;
};

export type ParsedLine =
  | { readonly kind: 'expense'; readonly expense: Expense }
  | { readonly kind: 'failure'; readonly reason: string };

type Columns = readonly [string, string, string, string];

const COLUMN_COUNT = 4;

function failed(reason: string): ParsedLine {
  return { kind: 'failure', reason };
}

function hasFourColumns(fields: readonly string[]): fields is Columns {
  return fields.length === COLUMN_COUNT;
}

function parseColumns(columns: Columns, today: string): ParsedLine {
  const date = columns[0].trim();
  const amount = columns[1].trim();
  const category = columns[2].trim();
  const note = columns[3].trim();
  if (!isValidDate(date)) {
    return failed('Invalid date');
  }
  if (date > today) {
    return failed('Date is in the future');
  }
  const cents = parseCents(amount);
  switch (cents.kind) {
    case 'invalid-amount':
      return failed('Invalid amount');
    case 'not-positive':
      return failed('Amount must be positive');
    case 'cents':
      return category === ''
        ? failed('Empty category')
        : { kind: 'expense', expense: { date, amountCents: cents.value, category, note } };
  }
}

function parseSplit(split: SplitResult, today: string): ParsedLine {
  switch (split.kind) {
    case 'unterminated-quote':
      return failed('Unterminated quote');
    case 'malformed-quote':
      return failed('Malformed quoted field');
    case 'fields':
      return hasFourColumns(split.fields)
        ? parseColumns(split.fields, today)
        : failed(`Expected 4 fields, found ${String(split.fields.length)}`);
  }
}

export function parseExpenseLine(line: string, today: string): ParsedLine {
  return parseSplit(splitLine(line), today);
}
