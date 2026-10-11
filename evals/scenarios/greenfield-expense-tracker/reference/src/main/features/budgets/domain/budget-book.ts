import { compareText, sorted } from '../../../shared/ordering.js';
import { isMonth } from '../../calendar/index.js';

export type Budget = {
  readonly month: string;
  readonly category: string;
  readonly limitCents: number;
};

export type SetBudgetResult =
  | { readonly kind: 'saved'; readonly budgets: readonly Budget[] }
  | { readonly kind: 'invalid-month' }
  | { readonly kind: 'invalid-category' }
  | { readonly kind: 'invalid-amount' };

function byMonthThenCategory(left: Budget, right: Budget): number {
  if (left.month !== right.month) {
    return compareText(left.month, right.month);
  }
  return compareText(left.category, right.category);
}

export function setBudget(budgets: readonly Budget[], request: Budget): SetBudgetResult {
  const { month, category, limitCents } = request;
  if (!isMonth(month)) {
    return { kind: 'invalid-month' };
  }
  const name = category.trim();
  if (name === '') {
    return { kind: 'invalid-category' };
  }
  if (!Number.isInteger(limitCents) || limitCents < 0) {
    return { kind: 'invalid-amount' };
  }
  const others: readonly Budget[] = budgets.filter(
    (budget) => budget.month !== month || budget.category !== name,
  );
  return {
    kind: 'saved',
    budgets: sorted([...others, { month, category: name, limitCents }], byMonthThenCategory),
  };
}

export function budgetsInMonth(budgets: readonly Budget[], month: string): readonly Budget[] {
  return budgets.filter((budget) => budget.month === month);
}
