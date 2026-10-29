package shop.requests;

import java.util.ArrayList;
import java.util.List;

public class Notes {
  private final List<Object> entries = new ArrayList<>();

  public void record(Object entry) {
    entries.add(entry);
  }
}
