package shop;

import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

public final class Cells {
  private final Map<String, Integer> counts = new HashMap<>();
  private final Set<String> seen = new HashSet<>();

  public void add(String row, String col, int step) {
    counts.merge(row + "-" + col, 1, Integer::sum); // violation: DelimitedLookupKey
    seen.add(row + ":" + col); // violation: DelimitedLookupKey
    String key = row + "_" + col;
    counts.put(key, step); // violation: DelimitedLookupKey
    counts.put(row + "-" + step, 1);
    counts.put(step + "-" + step, 1);
    counts.put(row + col, 1);
    counts.put(List.of(row, col).toString(), 1);
    counts.put("total-" + row, 1);
  }

  public void owned(String owner, String method, String row, String col, AtomicInteger sequence) {
    counts.put(owner + "#" + method, 1);
    counts.put(row + "-" + col + "-" + sequence.getAndIncrement(), 1);
    seen.add(violation(row + "." + col));
  }

  private String violation(String message) {
    return message;
  }

  public int count(String row, String col) {
    return counts.getOrDefault(row + "/" + col, 0); // violation: DelimitedLookupKey
  }
}
