package shop.shared;

import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class Sessions {
  private final ConcurrentMap<String, ExecutorService> pools = new ConcurrentHashMap<>();
  private final Map<String, String> labels = new ConcurrentHashMap<>();
  private final Map<String, String> plain = new java.util.HashMap<>();
  private final ConcurrentMap<String, String> grow = new ConcurrentHashMap<>();
  private final ConcurrentMap<String, Boolean> flags = new ConcurrentHashMap<>();

  public ExecutorService poolFor(String tenant) {
    if (!pools.containsKey(tenant)) {
      pools.put(tenant, Executors.newSingleThreadExecutor()); // violation: ConcurrentMapCheckThenAct
    }
    return pools.get(tenant);
  }

  public String label(String id, String fallback) {
    return labels.containsKey(id) ? labels.get(id) : fallback; // violation: ConcurrentMapCheckThenAct
  }

  public void rename(String id, String name) {
    if (labels.get(id) == null) {
      labels.put(id, name); // violation: ConcurrentMapCheckThenAct
    }
  }

  public int dropped(String id) {
    if (labels.containsKey(id)) {
      String old = labels.remove(id); // violation: ConcurrentMapCheckThenAct
      return old.length();
    }
    return 0;
  }

  public void drop(String id) {
    if (labels.containsKey(id)) {
      labels.remove(id);
    }
  }

  public ExecutorService poolAtomic(String tenant) {
    return pools.computeIfAbsent(tenant, key -> Executors.newSingleThreadExecutor());
  }

  public String labelAtomic(String id, String fallback) {
    return labels.getOrDefault(id, fallback);
  }

  public String labelLocal(String id, String name) {
    String current = labels.get(id);
    if (current == null) {
      labels.putIfAbsent(id, name);
    }
    return current;
  }

  public void renameLocked(String id, String name) {
    synchronized (labels) {
      if (!labels.containsKey(id)) {
        labels.put(id, name);
      }
    }
  }

  public void renameOther(String id, String other, String name) {
    if (!labels.containsKey(id)) {
      labels.put(other, name);
    }
  }

  public void renamePlain(String id, String name) {
    if (!plain.containsKey(id)) {
      plain.put(id, name);
    }
  }

  public String growing(String id, String name) {
    if (grow.containsKey(id)) {
      return grow.get(id);
    }
    grow.put(id, name);
    return name;
  }

  public void flag(String id) {
    if (!flags.containsKey(id)) {
      flags.put(id, Boolean.TRUE);
    }
  }

  public void flagAll(Iterator<String> ids) {
    while (ids.hasNext()) {
      if (!labels.containsKey(ids.next())) {
        labels.put(ids.next(), "seen");
      }
    }
  }
}
