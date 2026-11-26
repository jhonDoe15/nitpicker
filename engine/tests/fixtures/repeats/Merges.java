package repeats;

import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

public class Merges {
  private final Map<String, List<String>> shared = new HashMap<>();

  Map<String, Set<String>> callsOf(String file) {
    return Map.of(file, Set.of(file));
  }

  Map<String, Set<String>> parallel(List<String> files) {
    Map<String, Set<String>> all = new ConcurrentHashMap<>();
    files.parallelStream().forEach(file -> all.putAll(callsOf(file)));
    return all;
  }

  Map<String, Set<String>> looped(List<Map<String, Set<String>>> parts) {
    Map<String, Set<String>> all = new HashMap<>();
    for (Map<String, Set<String>> part : parts) {
      for (Map.Entry<String, Set<String>> entry : part.entrySet()) {
        all.put(entry.getKey(), entry.getValue());
      }
    }
    for (Map<String, Set<String>> part : parts) {
      part.forEach((key, values) -> all.put(key, values));
    }
    return all;
  }

  void field(List<Map<String, List<String>>> parts) {
    for (Map<String, List<String>> part : parts) {
      shared.putAll(part);
    }
  }

  Map<String, Integer> counts(List<Map<String, Integer>> parts) {
    Map<String, Integer> all = new HashMap<>();
    for (Map<String, Integer> part : parts) {
      all.putAll(part);
    }
    return all;
  }

  Map<String, Set<String>> merged(List<Map<String, Set<String>>> parts) {
    Map<String, Set<String>> all = new HashMap<>();
    for (Map<String, Set<String>> part : parts) {
      part.forEach((key, values) -> all.computeIfAbsent(key, ignored -> new HashSet<>()).addAll(values));
    }
    Map<String, Set<String>> once = new HashMap<>();
    once.putAll(parts.get(0));
    for (Map<String, Set<String>> part : parts) {
      Map<String, Set<String>> fresh = new HashMap<>();
      fresh.putAll(part);
      System.out.println(fresh);
    }
    return all;
  }
}
