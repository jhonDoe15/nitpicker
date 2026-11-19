package shop.fixed;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

public final class Manifests {
  public enum Kind { SERVICE, CONFIG, SECRET }

  public static String columns(List<String> fields) {
    Set<String> names = new HashSet<>();
    for (String field : fields) {
      names.add(field.trim());
    }
    return String.join(", ", names); // violation: HashOrderInOrderedOutput
  }

  public static String labels(Map<String, String> source) {
    Map<String, String> copy = new HashMap<>(source);
    StringBuilder out = new StringBuilder();
    for (Map.Entry<String, String> entry : copy.entrySet()) { // violation: HashOrderInOrderedOutput
      out.append(entry.getKey()).append('=').append(entry.getValue()).append('\n');
    }
    return out.toString();
  }

  public static String joined(List<String> fields) {
    Set<String> names = new HashSet<>(fields);
    return names.stream().collect(Collectors.joining(",")); // violation: HashOrderInOrderedOutput
  }

  public static List<Kind> kinds(List<Kind> declared) {
    Set<Kind> unique = new HashSet<>(declared);
    return new ArrayList<>(unique); // violation: HashOrderInOrderedOutput
  }

  public static Class<?>[] types(List<Class<?>> declared) {
    Set<Class<?>> unique = new HashSet<>();
    unique.addAll(declared);
    return unique.toArray(new Class<?>[0]); // violation: HashOrderInOrderedOutput
  }

  public static String ordered(List<String> fields) {
    Set<String> names = new LinkedHashSet<>(fields);
    return String.join(", ", names);
  }

  public static String sorted(List<String> fields) {
    Set<String> names = new HashSet<>(fields);
    return names.stream().sorted().collect(Collectors.joining(","));
  }

  public static String linked(Map<String, String> source) {
    Map<String, String> copy = new LinkedHashMap<>(source);
    StringBuilder out = new StringBuilder();
    for (Map.Entry<String, String> entry : copy.entrySet()) {
      out.append(entry.getKey()).append('=').append(entry.getValue()).append('\n');
    }
    return out.toString();
  }

  public static int total(Map<String, Integer> source) {
    Map<String, Integer> copy = new HashMap<>(source);
    int sum = 0;
    for (Integer value : copy.values()) {
      sum += value;
    }
    return sum;
  }

  public static List<String> names(List<String> fields) {
    Set<String> unique = new HashSet<>(fields);
    return new ArrayList<>(unique);
  }

  public static String message(List<String> fields) {
    Set<String> names = new HashSet<>(fields);
    throw new IllegalStateException("Unknown fields: " + String.join(", ", names));
  }

  public static String placeholders(List<String> fields) {
    Set<String> names = new HashSet<>(fields);
    StringBuilder out = new StringBuilder();
    for (String name : names) {
      out.append("?").append(",");
    }
    return out.toString();
  }

  public static int lengthOnly(List<String> fields) {
    Set<String> names = new HashSet<>(fields);
    StringBuilder out = new StringBuilder("x");
    int total = 0;
    for (String name : names) {
      total += name.length() + out.length();
    }
    return total;
  }

  public static String chained(List<String> fields) {
    Set<String> names = new HashSet<>(fields);
    StringBuilder out = new StringBuilder();
    for (String name : names) { // violation: HashOrderInOrderedOutput
      out.append("- ").append(name);
    }
    return out.toString();
  }

  public static String inList(List<String> ids) {
    Set<String> unique = new HashSet<>(ids);
    StringBuilder out = new StringBuilder("select * from orders where id in (");
    for (String id : unique) {
      out.append(id).append(',');
    }
    return out.append("0)").toString();
  }
}
