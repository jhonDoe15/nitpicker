package core;

import java.util.ArrayList;
import java.util.List;

public class Ledger {
  private final List<String> entries = new ArrayList<>();

  public List<String> entries() {
    return entries;
  }
}
