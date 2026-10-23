package shop.orders;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Service;

@Service
public class Counters {
  private static int created; // violation: SpringImmutableBeans

  private static final int LIMIT = 10;

  private final Map<String, Long> cache = new HashMap<>(); // violation: SpringBeanCollectionState
  private final List<String> names = new ArrayList<>(); // violation: SpringBeanCollectionState
  private final List<String> labels = new ArrayList<>();
  private final Map<String, Long> shared = new ConcurrentHashMap<>();

  public void touch(String key) {
    cache.put(key, 1L);
    this.names.add(key);
    shared.put(key, 2L);
    created++;
  }

  public int count() {
    return labels.size() + LIMIT;
  }
}
