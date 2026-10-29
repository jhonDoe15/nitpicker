package nitpicker.effects;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import nitpicker.effects.flow.MethodFlow;
import nitpicker.effects.flow.Origins;

public final class Report {
  private final List<Map<String, Object>> violations = new ArrayList<>();
  private final List<Map<String, Object>> covered = new ArrayList<>();
  private final Set<String> seen = new HashSet<>();
  private int classes;
  private int skipped;
  private int unreadableLibraries;

  public void add(String rule, MethodFlow flow, int index, String detail, Map<String, Object> extra) {
    String className = topLevel(flow.owner.name).replace('/', '.');
    int line = flow.line(index);
    if (line <= 0 || !seen.add(String.join("\0", rule, className, flow.file, String.valueOf(line), detail))) {
      return;
    }
    Map<String, Object> entry = new LinkedHashMap<>();
    entry.put("rule", rule);
    entry.put("className", className);
    entry.put("fileName", flow.file);
    entry.put("line", line);
    entry.put("firstLine", firstLine(flow, index, line));
    entry.put("method", methodName(flow));
    entry.put("detail", detail);
    entry.putAll(extra);
    violations.add(entry);
  }

  public void cover(String rule, MethodFlow flow, int index, String kind, String form, boolean owned) {
    int line = flow.line(index);
    if (line <= 0) {
      return;
    }
    Map<String, Object> fact = new LinkedHashMap<>();
    fact.put("rule", rule);
    fact.put("className", topLevel(flow.owner.name).replace('/', '.'));
    fact.put("fileName", flow.file);
    fact.put("line", line);
    fact.put("firstLine", firstLine(flow, index, line));
    fact.put("kind", kind);
    fact.put("form", form);
    fact.put("verdict", owned ? "owned" : "exempt");
    if (seen.add(fact.toString())) {
      covered.add(fact);
    }
  }

  public void skipped(int classes) {
    skipped += classes;
  }

  public void loaded(int count) {
    classes += count;
  }

  public void unreadableLibraries(int count) {
    unreadableLibraries = count;
  }

  private static int firstLine(MethodFlow flow, int index, int line) {
    int first = line;
    Deque<Integer> queue = new ArrayDeque<>(List.of(index));
    Set<Integer> visited = new HashSet<>();
    Origins origins = new Origins(flow);
    while (!queue.isEmpty() && visited.size() < 200) {
      int at = queue.poll();
      if (!visited.add(at)) {
        continue;
      }
      int own = flow.line(at);
      first = own > 0 && own < first && line - own < 20 ? own : first;
      if (at == index || !Origins.isLoad(flow.insns[at])) {
        flow.operands(at).forEach(operand -> queue.addAll(origins.sources(operand)));
      }
    }
    return first;
  }

  public static String methodName(MethodFlow flow) {
    return flow.name;
  }

  static String topLevel(String internalName) {
    int dollar = internalName.indexOf('$', internalName.lastIndexOf('/') + 1);
    return dollar < 0 ? internalName : internalName.substring(0, dollar);
  }

  public String toJson() {
    StringBuilder out = new StringBuilder("{\"classes\":").append(classes).append(",\"skipped\":").append(skipped)
        .append(",\"unreadableLibraries\":").append(unreadableLibraries);
    out.append(",\"covered\":").append(value(covered)).append(",\"violations\":[");
    for (int index = 0; index < violations.size(); index++) {
      out.append(index == 0 ? "\n" : ",\n").append(value(violations.get(index)));
    }
    return out.append("\n]}\n").toString();
  }

  private static String value(Object value) {
    if (value instanceof Map<?, ?> map) {
      StringBuilder out = new StringBuilder("{");
      for (Map.Entry<?, ?> entry : map.entrySet()) {
        out.append(out.length() == 1 ? "" : ",").append(quote(entry.getKey().toString())).append(':')
            .append(value(entry.getValue()));
      }
      return out.append('}').toString();
    }
    if (value instanceof List<?> list) {
      StringBuilder out = new StringBuilder("[");
      for (Object item : list) {
        out.append(out.length() == 1 ? "" : ",").append(value(item));
      }
      return out.append(']').toString();
    }
    if (value instanceof Number || value instanceof Boolean) {
      return value.toString();
    }
    return value == null ? "null" : quote(value.toString());
  }

  private static String quote(String text) {
    StringBuilder out = new StringBuilder("\"");
    for (char c : text.toCharArray()) {
      if (c == '"' || c == '\\') {
        out.append('\\').append(c);
      } else if (c < 0x20) {
        out.append(String.format("\\u%04x", (int) c));
      } else {
        out.append(c);
      }
    }
    return out.append('"').toString();
  }
}
