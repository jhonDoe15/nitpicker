import type { Account } from '../model';

export function flag(account: Account): boolean {
  if (account.frozen) {
    return true;
  }
  return account.balance < 0 ? true : false;
}
