package memory;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.WeakHashMap;
import java.util.concurrent.ConcurrentHashMap;

public class Caches {
  private final Map<String, Integer> prices = new HashMap<>();
  private final Map<String, Integer> lengths = new ConcurrentHashMap<>();
  private final Map<String, String> names = new WeakHashMap<>();
  private final Map<String, Integer> cleared = new HashMap<>();
  private final Map<String, Integer> shared = new HashMap<>();
  private final Map<String, Integer> bounded = new LinkedHashMap<>();
  private final Map<String, Integer> written = new HashMap<>();
  private final Map<String, Integer> otherKey = new HashMap<>();
  public final Map<String, Integer> visible = new HashMap<>();

  public int total(List<String> items) {
    int sum = 0;
    for (String item : items) {
      prices.put(item, item.length());
      sum += prices.get(item);
    }
    return sum;
  }

  public int streamed(List<String> items) {
    return items.stream().mapToInt(item -> this.lengths.computeIfAbsent(item, String::length)).sum();
  }

  public void named(List<String> items, List<String> out) {
    items.forEach(item -> {
      names.putIfAbsent(item.trim(), item);
      out.add(names.get(item.trim()));
    });
  }

  public int clearedEach(List<String> items) {
    int sum = 0;
    for (String item : items) {
      cleared.put(item, 1);
      sum += cleared.get(item);
    }
    cleared.clear();
    return sum;
  }

  public int sharedRead(List<String> items) {
    int sum = 0;
    for (String item : items) {
      shared.put(item, 1);
      sum += shared.get(item);
    }
    return sum;
  }

  public int sharedLater(String key) {
    return shared.getOrDefault(key, 0);
  }

  public int boundedEach(List<String> items) {
    int sum = 0;
    for (String item : items) {
      bounded.put(item, 1);
      sum += bounded.get(item);
    }
    return sum;
  }

  public void writeOnly(List<String> items) {
    for (String item : items) {
      written.put(item, 1);
    }
  }

  public int other(List<String> items, String key) {
    int sum = 0;
    for (String item : items) {
      otherKey.put(key, 1);
      sum += otherKey.get(item);
    }
    return sum;
  }

  public int visibleEach(List<String> items) {
    int sum = 0;
    for (String item : items) {
      visible.put(item, 1);
      sum += visible.get(item);
    }
    return sum;
  }

  private final Map<String, String> outsideLoop = new HashMap<>();

  public void store(String id, String name) {
    outsideLoop.put(id, name);
  }

  public int readAll(List<String> ids) {
    int found = 0;
    for (String id : ids) {
      if (outsideLoop.containsKey(id)) {
        found += outsideLoop.get(id).length();
      }
    }
    return found;
  }

  private final Map<String, Integer> trimmed = new HashMap<>();

  public int trimmedKeys(List<String> items) {
    int sum = 0;
    for (String item : items) {
      trimmed.put(item.trim(), 1);
      sum += trimmed.getOrDefault(item, 0);
    }
    return sum;
  }
}
