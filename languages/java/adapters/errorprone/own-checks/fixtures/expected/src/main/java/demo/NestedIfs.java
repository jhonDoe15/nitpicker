package demo;

import java.util.List;

public class NestedIfs {
  void braced(boolean first, boolean second, List<String> out) {
    if (first && second) {
      out.add("both");
      out.add("again");
    }
  }

  void lowerConditions(boolean first, boolean second, boolean third, boolean fourth, List<String> out) {
    if ((first || second) && (third ? fourth : first)) {
      out.add("both");
    }
  }

  void afterElse(boolean first, boolean second, boolean third, List<String> out) {
    if (first) {
      out.add("first");
    } else if (second && third) {
      out.add("third");
    }
  }

  void outerElse(boolean first, boolean second, List<String> out) {
    if (first) {
      if (second) {
        out.add("both");
      }
    } else {
      out.add("neither");
    }
  }

  void innerElse(boolean first, boolean second, List<String> out) {
    if (first) {
      if (second) {
        out.add("both");
      } else {
        out.add("first");
      }
    }
  }

  void otherStatement(boolean first, boolean second, List<String> out) {
    if (first) {
      out.add("first");
      if (second) {
        out.add("both");
      }
    }
  }

  void commentBefore(boolean first, boolean second, List<String> out) {
    if (first) {
      // only when second holds
      if (second) {
        out.add("both");
      }
    }
  }

  void commentAfter(boolean first, boolean second, List<String> out) {
    if (first) {
      if (second) {
        out.add("both");
      }
      // done
    }
  }
}
