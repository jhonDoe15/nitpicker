package store;

import java.util.ArrayList;
import java.util.List;

public class Shelf {
  private final List<String> items = new ArrayList<>();
  private final List<String> spare = new ArrayList<>();

  public List<String> items() {
    return items;
  }

  public List<String> spare() {
    return spare;
  }

  public int count(List<String> items) {
    items = List.copyOf(items);
    return items.size();
  }

  public int local() {
    List<String> spare = List.of();
    spare = List.copyOf(spare);
    return spare.size();
  }
}
