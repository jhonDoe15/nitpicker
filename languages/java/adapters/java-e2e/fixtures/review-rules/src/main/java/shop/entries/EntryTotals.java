package shop.entries;

import java.util.Comparator;
import java.util.List;

public class EntryTotals {
  private final EntryRepository entries;

  public EntryTotals(EntryRepository entries) {
    this.entries = entries;
  }

  public int count(String account) {
    return entries.forAccount(account).size(); // violation: SpringDataFilterInQuery
  }

  public long balance(String account) {
    return entries.forAccount(account).stream().mapToLong(Entry::getAmount).sum(); // violation: SpringDataFilterInQuery
  }

  public List<Entry> history(String account) {
    return entries.forAccount(account).stream() // violation: SpringDataFilterInQuery
        .sorted(Comparator.comparing(Entry::getBookedAt))
        .toList();
  }

  public List<Entry> large(String account, long floor) {
    return entries.forAccount(account).stream() // violation: SpringDataFilterInQuery
        .filter(entry -> entry.getAmount() > floor)
        .toList();
  }

  public List<Entry> credits(String account) {
    return entries.forAccount(account).stream().filter(entry -> entry.isCredit()).toList();
  }

  public long pending(String account) {
    return entries.forAccount(account).stream().mapToLong(Entry::getPending).sum();
  }

  public List<String> namedAccounts() {
    return entries.accounts().stream().filter(String::isBlank).toList();
  }
}
