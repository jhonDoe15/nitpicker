import { z } from 'zod';
import { readJsonFile, writeJsonFile } from '../../../shared/json-file.js';
import type { TextFiles } from '../../../shared/text-files.js';
import type { Expense } from '../domain/expense.js';

const EXPENSES_PATH = 'data/expenses.json';

const expenseFileSchema = z.object({
  expenses: z.array(
    z.object({
      date: z.string(),
      amountCents: z.number().int(),
      category: z.string(),
      note: z.string(),
    }),
  ),
});

export async function loadExpenses(files: TextFiles): Promise<readonly Expense[]> {
  const file = await readJsonFile(files, EXPENSES_PATH, expenseFileSchema);
  return file?.expenses ?? [];
}

export async function saveExpenses(files: TextFiles, expenses: readonly Expense[]): Promise<void> {
  await writeJsonFile(files, EXPENSES_PATH, { expenses });
}
