package values.parallel;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Queue;
import java.util.Set;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.stream.Collectors;

public class Totals {
  private final List<String> seen = new ArrayList<>();

  public List<Integer> doubled(List<Integer> values) {
    List<Integer> result = new ArrayList<>();
    values.parallelStream().forEach(v -> result.add(v * 2));
    return result;
  }

  public Map<String, Integer> lengths(List<String> names) {
    Map<String, Integer> result = new HashMap<>();
    names.stream().parallel().forEach(n -> result.put(n, n.length()));
    return result;
  }

  public void remember(List<String> names) {
    names.parallelStream().peek(n -> seen.add(n)).count();
  }

  public List<Integer> safeDoubled(List<Integer> values) {
    return values.parallelStream().map(v -> v * 2).collect(Collectors.toList());
  }

  public List<Integer> concurrentDoubled(List<Integer> values) {
    List<Integer> result = new CopyOnWriteArrayList<>();
    values.parallelStream().forEach(v -> result.add(v * 2));
    return result;
  }

  public Map<String, Integer> concurrentLengths(List<String> names) {
    Map<String, Integer> result = new ConcurrentHashMap<>();
    names.parallelStream().forEach(n -> result.put(n, n.length()));
    return result;
  }

  public List<Integer> sequentialDoubled(List<Integer> values) {
    List<Integer> result = new ArrayList<>();
    values.stream().forEach(v -> result.add(v * 2));
    return result;
  }

  public int localOnly(List<List<Integer>> rows) {
    return rows.parallelStream().mapToInt(row -> {
      List<Integer> copy = new ArrayList<>();
      copy.addAll(row);
      return copy.size();
    }).sum();
  }

  public List<Integer> locked(List<Integer> values) {
    List<Integer> result = new ArrayList<>();
    values.parallelStream().forEach(v -> {
      synchronized (result) {
        result.add(v * 2);
      }
    });
    return result;
  }

  public void afterCollect(List<String> names) {
    List<String> out = new ArrayList<>();
    names.parallelStream().map(String::trim).collect(Collectors.toList()).forEach(s -> out.add(s));
  }

  public void afterToList(List<String> names) {
    Map<String, Integer> out = new HashMap<>();
    names.parallelStream().map(String::trim).toList().forEach(s -> out.put(s, 1));
  }

  public void afterSequential(List<String> names) {
    List<String> out = new ArrayList<>();
    names.parallelStream().sequential().forEach(s -> out.add(s));
  }

  public void ordered(List<String> names) {
    List<String> out = new ArrayList<>();
    names.parallelStream().map(String::trim).forEachOrdered(s -> out.add(s));
  }

  public void queueParameter(List<String> names, Queue<String> seen) {
    names.parallelStream().forEach(s -> seen.add(s));
  }

  public void queueLocal(List<String> names) {
    Queue<String> seen = new ConcurrentLinkedQueue<>();
    names.parallelStream().forEach(s -> seen.add(s));
  }

  public void otherScope(List<String> names) {
    {
      List<String> out = new ArrayList<>();
      out.add("x");
    }
    Set<String> out = ConcurrentHashMap.newKeySet();
    names.parallelStream().forEach(s -> out.add(s));
  }

  public void nestedParallel(List<String> names, List<String> other) {
    List<String> out = new ArrayList<>();
    names.stream().filter(n -> other.parallelStream().anyMatch(n::equals)).forEach(n -> out.add(n));
  }
}
