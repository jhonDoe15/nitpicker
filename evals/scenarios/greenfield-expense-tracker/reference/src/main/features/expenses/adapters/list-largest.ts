import { monthOf } from '../../calendar/index.js';
import type { TextFiles } from '../../../shared/text-files.js';
import type { Expense } from '../domain/expense.js';
import { largestExpenses } from '../domain/month-expenses.js';
import { loadExpenses } from './expense-file.js';

export async function listLargest(
  files: TextFiles,
  today: string,
  month?: string,
): Promise<readonly Expense[]> {
  return largestExpenses(await loadExpenses(files), month ?? monthOf(today));
}
