import { codeLines } from '../layout-measures.mjs';

const OPENERS = [
  String.raw`\.\s*\$?transaction\s*\(`,
  String.raw`\.\s*transactional\s*\(`,
  String.raw`\b(?:startTransaction|beginTransaction|runInTransaction|withTransaction|inTransaction)\s*\(`,
  String.raw`@Transactional\s*\(`,
  String.raw`@Transaction\s*\(`,
];
const OPENS_TRANSACTION = new RegExp(OPENERS.join('|'), 'u');
const TEST_FILE =
  /(?:\.(?:test|spec)\.[^/]+$|(?:^|\/)(?:__tests__|test|tests|e2e|test-support)\/)/u;

export const TRANSACTIONS_CONVENTION = {
  id: 'typescript.transactions',
  label: 'Database transactions',
  options: ['used', 'unused'],
  optionLabels: { used: 'the project opens transactions', unused: 'no transactions found' },
  fallback: 'unused',
  files: ['**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'],
  scope: 'layout',
  sampleLimit: 2000,
  measure: opensTransaction,
};

export function projectOpensTransactions(conventions = {}) {
  return conventions[TRANSACTIONS_CONVENTION.id] === 'used';
}

function opensTransaction(text, file) {
  const opens = !TEST_FILE.test(file) && OPENS_TRANSACTION.test(codeLines(text).join('\n'));
  return opens ? 'used' : undefined;
}
