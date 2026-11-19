package demo;

import java.util.List;

public class UnbracedIfs {
  void unbracedOuter(boolean first, boolean second, List<String> out) {
    if (first)
      if (second) {
        out.add("both");
      }
  }

  void unbracedInner(boolean first, boolean second, List<String> out) {
    if (first) {
      if (second) out.add("both");
    }
  }

  void bothUnbraced(boolean first, boolean second, List<String> out) {
    if (first) if (second) out.add("both");
  }
}
