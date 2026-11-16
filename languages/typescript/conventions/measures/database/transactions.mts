import { fieldOf } from '../../../../../shared/values/readers.mts';
import { codeLines } from '../../typed/measure-views.mts';

const OPENERS = [
  String.raw`\.\s*\$?transaction\s*\(`,
  String.raw`\.\s*transactional\s*\(`,
  String.raw`\b(?:startTransaction|beginTransaction|runInTransaction|withTransaction|inTransaction)\s*\(`,
  String.raw`@Transactional\s*\(`,
  String.raw`@Transaction\s*\(`,
];
const OPENS_TRANSACTION = new RegExp(OPENERS.join('|'), 'u');

export const TRANSACTIONS_CONVENTION = {
  id: 'typescript.transactions',
  label: 'Database transactions',
  options: ['used', 'unused'],
  optionLabels: { used: 'the project opens transactions', unused: 'no transactions found' },
  fallback: 'unused',
  files: ['**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'],
  scope: 'source',
  sampleLimit: 2000,
  measure: opensTransaction,
};

export function projectOpensTransactions(conventions: object = {}): boolean {
  return fieldOf(conventions, TRANSACTIONS_CONVENTION.id) === 'used';
}

function opensTransaction(text: string): string | undefined {
  const opens = OPENS_TRANSACTION.test(codeLines(text).join('\n'));
  return opens ? 'used' : undefined;
}
