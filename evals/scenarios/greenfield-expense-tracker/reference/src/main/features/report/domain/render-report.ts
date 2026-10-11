import { formatCents } from '../../money/index.js';
import type { Expense } from '../../expenses/index.js';
import type { CategoryLine, MonthSummary } from './summarize-month.js';

function describeBudget(spentCents: number, limitCents: number | undefined): string {
  if (limitCents === undefined) {
    return 'no budget';
  }
  const budget = `budget ${formatCents(limitCents)}`;
  if (spentCents > limitCents) {
    return `${budget}, OVER BUDGET by ${formatCents(spentCents - limitCents)}`;
  }
  return `${budget}, ${formatCents(limitCents - spentCents)} remaining`;
}

function renderCategory(line: CategoryLine): string {
  return `${line.category}: ${formatCents(line.spentCents)} (${describeBudget(line.spentCents, line.limitCents)})`;
}

function renderLargest(expense: Expense, index: number): string {
  const base = `${String(index + 1)}. ${expense.date} ${expense.category} ${formatCents(expense.amountCents)}`;
  return expense.note === '' ? base : `${base} - ${expense.note}`;
}

function orElse(lines: readonly string[], fallback: string): readonly string[] {
  return lines.length === 0 ? [fallback] : lines;
}

export function renderReport(summary: MonthSummary): string {
  return [
    `Expense report for ${summary.month}`,
    '',
    ...orElse(summary.lines.map(renderCategory), 'No expenses.'),
    '',
    `Total: ${formatCents(summary.totalCents)}`,
    '',
    'Largest expenses:',
    ...orElse(summary.largest.map(renderLargest), 'None'),
    '',
  ].join('\n');
}
