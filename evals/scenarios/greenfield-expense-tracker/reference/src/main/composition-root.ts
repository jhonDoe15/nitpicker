import { saveBudget } from './features/budgets/index.js';
import type { SaveBudgetOutcome } from './features/budgets/index.js';
import { importExpenses, listLargest } from './features/expenses/index.js';
import type { Expense, ImportReport } from './features/expenses/index.js';
import { reportMonth } from './features/report/index.js';
import type { TextFiles } from './shared/text-files.js';

type ExpenseTrackerDeps = TextFiles & { readonly today: () => string };

type ExpenseTracker = {
  readonly importCsv: (csv: string) => Promise<ImportReport>;
  readonly setBudget: (
    month: string,
    category: string,
    limitCents: number,
  ) => Promise<SaveBudgetOutcome>;
  readonly report: (month?: string) => Promise<string>;
  readonly largest: (month?: string) => Promise<readonly Expense[]>;
};

export function createExpenseTracker(deps: ExpenseTrackerDeps): ExpenseTracker {
  return {
    importCsv: (csv: string) => importExpenses(deps, deps.today(), csv),
    setBudget: (month: string, category: string, limitCents: number) =>
      saveBudget(deps, { month, category, limitCents }),
    report: (month?: string) => reportMonth(deps, deps.today(), month),
    largest: (month?: string) => listLargest(deps, deps.today(), month),
  };
}
