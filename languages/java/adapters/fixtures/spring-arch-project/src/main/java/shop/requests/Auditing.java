package shop.requests;

import java.util.ArrayList;
import java.util.List;

public abstract class Auditing {
  private final List<String> audit = new ArrayList<>();

  protected void remember(String entry) {
    audit.add(entry);
  }
}
