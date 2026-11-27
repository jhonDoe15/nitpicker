import java.util.ArrayList;
import java.util.List;
import java.util.Map;

class S38PmiEdges {
  static class Base {
    protected int string;
    private int number;
    int helper;
  }

  static class Child extends Base {
    int a(Object o) {
      if (o instanceof String) {
        return ((String) o).length();
      }
      if (o instanceof Number) {
        return ((Number) o).intValue();
      }
      return 0;
    }

    static int b(Object o) {
      if (o instanceof Base) {
        return ((Base) o).helper;
      }
      return 0;
    }
  }

  int base;
  String list;

  void c(Object o, Object list2) {
    if (o instanceof List) {
      ((List) o).size();
    }
    if (o instanceof List) {
      List<String> typed = (List<String>) o;
    }
    if (o instanceof ArrayList) {
      Object kept = (ArrayList) o;
    }
    if (o instanceof Map) {
      Map raw = (Map) o;
      raw.size();
    }
    String string = "";
    if (o instanceof String) {
      String a = (String) o, b = "";
    }
    if (o instanceof String) {
      var v = (String) o;
      v.length();
    }
    if (!(o instanceof Integer)) {
      return;
    }
    int x = (Integer) o + 1;
    int y = ((Integer) o) + 2;
  }

  int d(Object o) {
    return o instanceof Integer ? (Integer) o : -1;
  }

  int e(Object o) {
    return !(o instanceof Integer) ? -1 : (Integer) o;
  }

  void f(Object o) {
    int i = 0;
    i++;
    Runnable r = () -> {
      if (o instanceof Integer) {
        ((Integer) o).hashCode();
      }
    };
    int j = 0;
    Runnable q = () -> {
      if (o instanceof Integer) {
        ((Integer) o).hashCode();
      }
    };
  }

  void g(Object o) {
    for (int s38PmiEdges = 0; s38PmiEdges < 1; s38PmiEdges++) {
      if (o instanceof S38PmiEdges) {
        ((S38PmiEdges) o).g(null);
      }
    }
    try (java.io.StringReader stringReader = new java.io.StringReader("")) {
      if (o instanceof java.io.StringReader) {
        ((java.io.StringReader) o).hashCode();
      }
    }
    if (o instanceof String && ((String) o).isEmpty()) {
      return;
    }
    if (o instanceof String || ((String) o).isEmpty()) {
      return;
    }
    while (o instanceof String) {
      ((String) o).hashCode();
    }
  }

  void h(Object o) {
    if (o instanceof String) {
      ((String) o).hashCode();
    } else if (o instanceof Integer) {
      ((Integer) o).hashCode();
    }
    if (o instanceof S38PmiEdges.Child) {
      ((Child) o).hashCode();
    }
    if (o instanceof S38PmiEdges) {
      ((S38PmiEdges) o).base++;
    }
  }

  int number;

  @SuppressWarnings("PatternMatchingInstanceof")
  void k(Object o) {
    if (o instanceof String) {
      ((String) o).hashCode();
    }
  }
}
