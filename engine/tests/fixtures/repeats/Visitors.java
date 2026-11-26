package repeats;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.NavigableSet;
import java.util.Set;
import java.util.SortedMap;
import java.util.SortedSet;

public class Visitors {
  record Call(String owner, String name, int arguments) {}

  record Signature(String text) {
    boolean takesObject() {
      return text.contains("Object");
    }
  }

  private final Set<String> project = Set.of("a.B");

  Signature resolveOverload(Call call) {
    return new Signature(call.name());
  }

  void pass(List<Call> calls) {
    for (Call call : calls) {
      Signature signature = resolveOverload(call);
      if (!project.contains(call.owner())) {
        continue;
      }
      System.out.println(signature.takesObject());
    }
    calls.forEach(call -> {
      Signature signature = resolveOverload(call);
      if (call.arguments() == 0) {
        return;
      }
      System.out.println(signature);
    });
    for (Call call : calls) {
      Signature signature = resolveOverload(call);
      if (project.remove(call.owner())) {
        continue;
      }
      System.out.println(signature);
    }
    for (Call call : calls) {
      Signature signature = resolveOverload(call);
      if (!project.contains(call.owner())) {
        System.out.println(signature);
        continue;
      }
      System.out.println(call);
    }
  }

  void visitCall(Call call) {
    Signature signature = resolveOverload(call);
    if (call.name().isEmpty()) {
      return;
    }
    System.out.println(signature);
  }

  Signature once(Call call) {
    Signature signature = resolveOverload(call);
    if (call.name().isEmpty()) {
      return null;
    }
    return signature;
  }
}

class Reviewed {
  record Pair(Object a, Object b) {}
  interface El { El getParent(); List<El> select(String q); String name(); }

  Object parse(Iterator<String> it) { return new Pair(parse(it), parse(it)); }

  int walk(int n) { return n == 0 ? 0 : walk(n - 1) + walk(n - 1); }

  void sorted(SortedMap<Integer, Integer> sm, SortedSet<String> ss, NavigableSet<Integer> ns) {
    for (Map.Entry<Integer, Integer> e : sm.entrySet()) { if (e.getValue() > 3 && e.getValue() < 9) return; }
    for (String s : ss) { if (s.length() > 3 && s.length() < 9) break; }
    for (Integer i : sm.keySet()) { if (i > 3 && i > 9) return; }
    for (Integer i : ns) { if (3 < i && i <= 9) return; }
    for (Map.Entry<Integer, Integer> e : sm.entrySet()) { if (e.getKey() >= 3 && e.getKey() < 9) return; }
  }

  void merges(List<Map<String, Set<String>>> srcs) {
    Map<String, Set<String>> a = new HashMap<>();
    for (Map<String, Set<String>> src : srcs) {
      for (Map.Entry<String, Set<String>> e : src.entrySet()) {
        if (!a.containsKey(e.getKey())) a.put(e.getKey(), e.getValue());
      }
      for (Map.Entry<String, Set<String>> e : src.entrySet()) {
        a.put(src.size() + "." + e.getKey(), e.getValue());
      }
      a.putAll(compute(src));
    }
  }

  Map<String, Set<String>> compute(Map<String, Set<String>> s) { return s; }

  void climb(El start) {
    El cur = start;
    while (cur != null) { if (cur.name().equals("x")) { cur.select("a"); break; } cur = cur.getParent(); }
  }

  void mutate(List<String> s) { s.add("x"); }

  List<List<String>> copies(List<String> xs, List<String> src) {
    List<List<String>> out = new ArrayList<>();
    for (String x : xs) { mutate(src); out.add(new ArrayList<>(src)); }
    return out;
  }

  void pairs(List<String> names) {
    List<String> k6 = names.stream().filter(n -> !n.isEmpty()).toList();
    List<String> k7 = k6.stream().map(String::trim).toList();
    for (int i = 0; i < k6.size(); i++) System.out.println(k6.get(i) + k7.get(i));
  }

  List<String> early(List<String> xs) {
    List<String> copy = new ArrayList<>(xs);
    if (xs == null) throw new IllegalArgumentException();
    return copy;
  }

  void lookups(List<Object> xs) throws Exception {
    for (Object x : xs) {
      Runnable r = () -> { try { Reviewed.class.getMethod("walk", int.class); } catch (Exception e) { } };
      r.run();
    }
    for (String n : List.of("a", "b")) System.out.println(Reviewed.class.getMethod(n));
    for (String n : List.of("a", "b")) System.out.println(Reviewed.class.getMethod("walk", int.class));
  }
}
