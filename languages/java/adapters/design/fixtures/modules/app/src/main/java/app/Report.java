package app;

import core.Ledger;

public class Report {
  public void note(Ledger ledger) {
    ledger.entries().add("seen");
  }
}
