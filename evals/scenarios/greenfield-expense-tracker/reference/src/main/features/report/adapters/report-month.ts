import type { TextFiles } from '../../../shared/text-files.js';
import { loadBudgets } from '../../budgets/index.js';
import { isMonth, monthOf } from '../../calendar/index.js';
import { loadExpenses } from '../../expenses/index.js';
import { renderReport } from '../domain/render-report.js';
import { summarizeMonth } from '../domain/summarize-month.js';

export async function reportMonth(
  files: TextFiles,
  today: string,
  requestedMonth?: string,
): Promise<string> {
  const month = requestedMonth ?? monthOf(today);
  if (!isMonth(month)) {
    return `Invalid month: ${month}\n`;
  }
  const [expenses, budgets] = await Promise.all([loadExpenses(files), loadBudgets(files)]);
  return renderReport(summarizeMonth(month, expenses, budgets));
}
