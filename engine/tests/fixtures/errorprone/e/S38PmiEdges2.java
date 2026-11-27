import java.util.*;

class S38PmiEdges2 {
  boolean a(Object o) {
    if (o instanceof Collection<?>) {
      return ((Collection<?>) o).isEmpty();
    }
    return false;
  }
  boolean b(Object o) {
    if (o instanceof Collection) {
      return ((Collection<?>) o).isEmpty();
    }
    return false;
  }
  boolean c(Object o) {
    if (o instanceof Collection<?>) {
      return ((Collection) o).isEmpty();
    }
    return false;
  }
  boolean d(Collection<String> o) {
    if (o instanceof List<String>) {
      return ((List<String>) o).isEmpty();
    }
    return false;
  }
  boolean e(Object o) {
    if (o instanceof Map<?, ?>) {
      Map<?, ?> m = (Map<?, ?>) o;
      return m.isEmpty();
    }
    return false;
  }
  int f(Object o) {
    if (o instanceof int[]) {
      return ((int[]) o).length;
    } else if (o instanceof long[]) {
      return ((long[]) o).length;
    }
    return 0;
  }
}

class S38PmiOuter<N> {
  private class Inner {
    int x;
  }

  static class Nested {
    int x;
  }

  int a(Object o) {
    if (o instanceof S38PmiOuter.Inner) {
      return ((Inner) o).x;
    }
    return 0;
  }

  int c(Object o) {
    if (o instanceof S38PmiOuter.Inner) {
      return ((S38PmiOuter.Inner) o).x;
    }
    return 0;
  }

  int d(Object o) {
    if (o instanceof S38PmiOuter.Nested) {
      return ((Nested) o).x;
    }
    return 0;
  }

  int e(Object o) {
    if (o instanceof S38PmiOuter<?>.Inner) {
      return ((Inner) o).x;
    }
    return 0;
  }
}
