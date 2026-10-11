import { compareText, sorted } from '../../../shared/ordering.js';
import { budgetsInMonth } from '../../budgets/index.js';
import type { Budget } from '../../budgets/index.js';
import { expensesInMonth, largestExpenses } from '../../expenses/index.js';
import type { Expense } from '../../expenses/index.js';

export type CategoryLine = {
  readonly category: string;
  readonly spentCents: number;
  readonly limitCents: number | undefined;
};

export type MonthSummary = {
  readonly month: string;
  readonly lines: readonly CategoryLine[];
  readonly totalCents: number;
  readonly largest: readonly Expense[];
};

function sumCents(expenses: readonly Expense[]): number {
  return expenses.reduce((sum, expense) => sum + expense.amountCents, 0);
}

function bySpentThenCategory(left: CategoryLine, right: CategoryLine): number {
  if (left.spentCents !== right.spentCents) {
    return right.spentCents - left.spentCents;
  }
  return compareText(left.category, right.category);
}

function lineFor(
  category: string,
  expenses: readonly Expense[],
  budgets: readonly Budget[],
): CategoryLine {
  return {
    category,
    spentCents: sumCents(expenses.filter((expense) => expense.category === category)),
    limitCents: budgets.find((budget) => budget.category === category)?.limitCents,
  };
}

export function summarizeMonth(
  month: string,
  expenses: readonly Expense[],
  budgets: readonly Budget[],
): MonthSummary {
  const monthExpenses = expensesInMonth(expenses, month);
  const monthBudgets = budgetsInMonth(budgets, month);
  const names: readonly string[] = [
    ...monthExpenses.map((expense) => expense.category),
    ...monthBudgets.map((budget) => budget.category),
  ];
  const categories: readonly string[] = names.filter(
    (name, index) => names.indexOf(name) === index,
  );
  return {
    month,
    lines: sorted(
      categories.map((category) => lineFor(category, monthExpenses, monthBudgets)),
      bySpentThenCategory,
    ),
    totalCents: sumCents(monthExpenses),
    largest: largestExpenses(expenses, month),
  };
}
