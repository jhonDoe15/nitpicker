import type { TextFiles } from '../../../shared/text-files.js';
import type { Budget } from '../domain/budget-book.js';
import { setBudget } from '../domain/budget-book.js';
import { loadBudgets, saveBudgets } from './budget-file.js';

export type SaveBudgetOutcome =
  | { readonly kind: 'saved' }
  | { readonly kind: 'invalid-month' }
  | { readonly kind: 'invalid-category' }
  | { readonly kind: 'invalid-amount' };

export async function saveBudget(files: TextFiles, request: Budget): Promise<SaveBudgetOutcome> {
  const result = setBudget(await loadBudgets(files), request);
  if (result.kind !== 'saved') {
    return result;
  }
  await saveBudgets(files, result.budgets);
  return { kind: 'saved' };
}
