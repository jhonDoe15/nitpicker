import { z } from 'zod';
import { readJsonFile, writeJsonFile } from '../../../shared/json-file.js';
import type { TextFiles } from '../../../shared/text-files.js';
import type { Budget } from '../domain/budget-book.js';

const BUDGETS_PATH = 'data/budgets.json';

const budgetFileSchema = z.object({
  budgets: z.array(
    z.object({
      month: z.string(),
      category: z.string(),
      limitCents: z.number().int().nonnegative(),
    }),
  ),
});

export async function loadBudgets(files: TextFiles): Promise<readonly Budget[]> {
  const file = await readJsonFile(files, BUDGETS_PATH, budgetFileSchema);
  return file?.budgets ?? [];
}

export async function saveBudgets(files: TextFiles, budgets: readonly Budget[]): Promise<void> {
  await writeJsonFile(files, BUDGETS_PATH, { budgets });
}
