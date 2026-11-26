package repeats;

import java.util.ArrayList;
import java.util.Arrays;
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

  record Report(String finding, List<String> lines) {}

  private final List<String> header = new ArrayList<>();

  List<Report> reports(List<String> findings, List<String> sourceLines, Map<String, String> settings, String[] words) {
    List<Report> reports = new ArrayList<>();
    for (String finding : findings) {
      reports.add(new Report(finding, new ArrayList<>(sourceLines)));
    }
    List<List<String>> copies = new ArrayList<>();
    for (String finding : findings) {
      copies.add(List.copyOf(sourceLines));
      copies.add(new ArrayList<>(this.header));
    }
    List<Map<String, String>> maps = findings.stream().map(finding -> new HashMap<>(settings)).toList();
    List<String[]> arrays = new ArrayList<>();
    findings.forEach(finding -> arrays.add(Arrays.copyOf(words, words.length)));
    System.out.println(maps.size() + arrays.size() + copies.size());
    return reports;
  }

  List<Report> declines(List<String> findings, List<String> sourceLines) {
    List<Report> reports = new ArrayList<>();
    List<String> small = List.of("a", "b");
    for (String finding : findings) {
      List<String> own = new ArrayList<>(sourceLines);
      own.add(finding);
      reports.add(new Report(finding, own));
      reports.add(new Report(finding, new ArrayList<>(small)));
    }
    List<String> growing = new ArrayList<>();
    for (String finding : findings) {
      growing.add(finding);
      reports.add(new Report(finding, new ArrayList<>(growing)));
    }
    for (String finding : List.of("x", "y")) {
      reports.add(new Report(finding, new ArrayList<>(sourceLines)));
    }
    for (int i = 0; i < 3; i++) {
      reports.add(new Report(findings.get(i), new ArrayList<>(sourceLines)));
    }
    Report once = new Report("all", new ArrayList<>(sourceLines));
    reports.add(once);
    return reports;
  }
}
