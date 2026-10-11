import { compareText, sorted } from '../../../shared/ordering.js';
import { monthOf } from '../../calendar/index.js';
import type { Expense } from './expense.js';

const LARGEST_COUNT = 3;

function byLargest(left: Expense, right: Expense): number {
  if (left.amountCents !== right.amountCents) {
    return right.amountCents - left.amountCents;
  }
  return compareText(left.date, right.date);
}

export function expensesInMonth(expenses: readonly Expense[], month: string): readonly Expense[] {
  return expenses.filter((expense) => monthOf(expense.date) === month);
}

export function largestExpenses(expenses: readonly Expense[], month: string): readonly Expense[] {
  return sorted(expensesInMonth(expenses, month), byLargest).slice(0, LARGEST_COUNT);
}
