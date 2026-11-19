package shop.shared;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

public final class Subscriptions {
  private final Map<String, Set<String>> byTopic = new ConcurrentHashMap<>();
  private final ConcurrentMap<String, List<String>> history = new ConcurrentHashMap<>();
  private final Map<Thread, Set<String>> perThread = new ConcurrentHashMap<>();
  private final Map<String, Set<String>> safeByTopic = new ConcurrentHashMap<>();

  public void subscribe(String topic, String listener) {
    byTopic.computeIfAbsent(topic, key -> new HashSet<>()).add(listener); // violation: PlainCollectionInConcurrentMap
  }

  public void record(String topic, String event) {
    List<String> events = history.computeIfAbsent(topic, key -> new ArrayList<>());
    events.add(event); // violation: PlainCollectionInConcurrentMap
  }

  public void subscribeSafely(String topic, String listener) {
    safeByTopic.computeIfAbsent(topic, key -> ConcurrentHashMap.newKeySet()).add(listener);
  }

  public void recordLocked(String topic, String event) {
    List<String> events = history.computeIfAbsent(topic, key -> new ArrayList<>());
    synchronized (events) {
      events.add(event);
    }
  }

  public int listeners(String topic) {
    return byTopic.computeIfAbsent(topic, key -> new HashSet<>()).size();
  }

  public void remember(String topic) {
    perThread.computeIfAbsent(Thread.currentThread(), key -> new HashSet<>()).add(topic);
  }

  public int replaced(String topic, String event) {
    List<String> events = history.computeIfAbsent(topic, key -> new ArrayList<>());
    events = List.copyOf(events);
    events.add(event);
    return events.size();
  }
}
