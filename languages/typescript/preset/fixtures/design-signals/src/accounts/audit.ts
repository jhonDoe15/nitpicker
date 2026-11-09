import type { Account } from '../model';

export function audit(account: Account): string {
  if (account.balance > 0 && account.frozen) {
    return 'held';
  }
  return 'clear';
}
