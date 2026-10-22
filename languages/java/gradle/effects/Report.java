package nitpicker.effects;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import nitpicker.effects.flow.MethodFlow;

public final class Report {
  private final List<Map<String, Object>> violations = new ArrayList<>();
  private final Set<String> seen = new HashSet<>();

  public void add(String rule, MethodFlow flow, int index, String detail, Map<String, Object> extra) {
    String className = topLevel(flow.owner.name).replace('/', '.');
    int line = flow.line(index);
    if (line <= 0 || !seen.add(rule + '\0' + className + '\0' + flow.owner.sourceFile + '\0' + line)) {
      return;
    }
    Map<String, Object> entry = new LinkedHashMap<>();
    entry.put("rule", rule);
    entry.put("className", className);
    entry.put("fileName", flow.owner.sourceFile == null ? "" : flow.owner.sourceFile);
    entry.put("line", line);
    entry.put("method", methodName(flow));
    entry.put("detail", detail);
    entry.putAll(extra);
    violations.add(entry);
  }

  public static String methodName(MethodFlow flow) {
    String owner = topLevel(flow.owner.name);
    String simple = owner.substring(owner.lastIndexOf('/') + 1);
    String name = flow.method.name;
    if (!owner.equals(flow.owner.name)) {
      String segment = flow.owner.name.substring(owner.length() + 1).split("\\$")[0];
      boolean numbered = segment.matches("\\d+");
      name = !numbered ? segment : flow.owner.outerMethod != null ? flow.owner.outerMethod : name;
    }
    int lambda = name.indexOf("$lambda");
    if (name.startsWith("lambda$")) {
      String[] parts = name.split("\\$");
      name = parts.length > 1 ? parts[1] : name;
    } else if (lambda > 0) {
      name = name.substring(0, lambda);
    }
    return simple + "." + name;
  }

  static String topLevel(String internalName) {
    int dollar = internalName.indexOf('$', internalName.lastIndexOf('/') + 1);
    return dollar < 0 ? internalName : internalName.substring(0, dollar);
  }

  public String toJson() {
    StringBuilder out = new StringBuilder("{\"violations\":[");
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
