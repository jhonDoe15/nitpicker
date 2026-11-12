package store;

import java.util.ArrayList;
import java.util.List;

public class Basket {
  private final List<String> lines = new ArrayList<>();
  private final int[] codes = new int[3];

  public List<String> lines() {
    return lines;
  }

  public List<String> copy() {
    return List.copyOf(lines);
  }

  public int[] codes() {
    return codes;
  }
}
