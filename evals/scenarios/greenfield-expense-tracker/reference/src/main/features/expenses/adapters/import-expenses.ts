import type { TextFiles } from '../../../shared/text-files.js';
import { importCsv } from '../domain/import-csv.js';
import type { ImportError } from '../domain/import-csv.js';
import { loadExpenses, saveExpenses } from './expense-file.js';

export type ImportReport = {
  readonly imported: number;
  readonly errors: readonly ImportError[];
};

export async function importExpenses(
  files: TextFiles,
  today: string,
  csv: string,
): Promise<ImportReport> {
  const { expenses, errors } = importCsv(csv, today);
  if (expenses.length > 0) {
    const existing = await loadExpenses(files);
    await saveExpenses(files, [...existing, ...expenses]);
  }
  return { imported: expenses.length, errors };
}
