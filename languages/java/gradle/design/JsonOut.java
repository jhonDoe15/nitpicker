package nitpicker.designfacts;

import java.util.Collection;
import java.util.Map;

public final class JsonOut {
  private JsonOut() {}

  public static String of(Object value) {
    StringBuilder out = new StringBuilder();
    write(out, value);
    return out.toString();
  }

  private static void write(StringBuilder out, Object value) {
    if (value instanceof Map<?, ?> map) {
      writeMap(out, map);
    } else if (value instanceof Collection<?> collection) {
      writeList(out, collection);
    } else if (value instanceof Number || value instanceof Boolean) {
      out.append(value);
    } else {
      quote(out, String.valueOf(value));
    }
  }

  private static void writeMap(StringBuilder out, Map<?, ?> map) {
    out.append('{');
    boolean first = true;
    for (Map.Entry<?, ?> entry : map.entrySet()) {
      if (entry.getValue() != null) {
        out.append(first ? "" : ",");
        first = false;
        quote(out, String.valueOf(entry.getKey()));
        out.append(':');
        write(out, entry.getValue());
      }
    }
    out.append('}');
  }

  private static void writeList(StringBuilder out, Collection<?> collection) {
    out.append('[');
    boolean first = true;
    for (Object item : collection) {
      out.append(first ? "" : ",");
      first = false;
      write(out, item);
    }
    out.append(']');
  }

  private static void quote(StringBuilder out, String text) {
    out.append('"');
    for (char c : text.toCharArray()) {
      out.append(escape(c));
    }
    out.append('"');
  }

  private static String escape(char c) {
    return switch (c) {
      case '"' -> "\\\"";
      case '\\' -> "\\\\";
      case '\n' -> "\\n";
      case '\r' -> "\\r";
      case '\t' -> "\\t";
      default -> c < 0x20 ? String.format("\\u%04x", (int) c) : String.valueOf(c);
    };
  }
}
