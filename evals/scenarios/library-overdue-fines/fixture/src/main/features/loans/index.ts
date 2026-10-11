export type { LoanRepository } from './adapters/in-memory-loans.js';
export { createInMemoryLoans } from './adapters/in-memory-loans.js';
export type { Loan } from './domain/loan.js';
export { daysLate, describeLoan } from './domain/loan.js';
