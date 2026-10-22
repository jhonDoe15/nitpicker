package nitpicker.kotlinpsi.common;

import java.util.*;

public final class Json {
  public record Raw(String text) {}

  public static String of(Object value) {
    StringBuilder out = new StringBuilder();
    write(out, value);
    return out.toString();
  }

  private static void write(StringBuilder out, Object value) {
    if (value == null) {
      out.append("null");
    } else if (value instanceof Raw raw) {
      out.append(raw.text());
    } else if (value instanceof Map<?, ?> map) {
      out.append('{');
      boolean first = true;
      for (Map.Entry<?, ?> entry : map.entrySet()) {
        if (entry.getValue() == null) {
          continue;
        }
        out.append(first ? "" : ",");
        first = false;
        quote(out, String.valueOf(entry.getKey()));
        out.append(':');
        write(out, entry.getValue());
      }
      out.append('}');
    } else if (value instanceof Collection<?> collection) {
      out.append('[');
      boolean first = true;
      for (Object item : collection) {
        out.append(first ? "" : ",");
        first = false;
        write(out, item);
      }
      out.append(']');
    } else if (value instanceof Number || value instanceof Boolean) {
      out.append(value);
    } else {
      quote(out, value.toString());
    }
  }

  public static String quote(String text) {
    StringBuilder out = new StringBuilder();
    quote(out, text);
    return out.toString();
  }

  private static void quote(StringBuilder out, String text) {
    out.append('"');
    for (char c : text.toCharArray()) {
      switch (c) {
        case '"' -> out.append("\\\"");
        case '\\' -> out.append("\\\\");
        case '\n' -> out.append("\\n");
        case '\r' -> out.append("\\r");
        case '\t' -> out.append("\\t");
        default -> out.append(c < 0x20 ? String.format("\\u%04x", (int) c) : String.valueOf(c));
      }
    }
    out.append('"');
  }
}
