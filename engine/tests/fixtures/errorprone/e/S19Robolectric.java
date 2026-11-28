package e;

import java.util.List;
import java.util.Map;
import org.robolectric.shadow.api.Shadow;

class S19Robolectric {
  static class Foo {
    Runnable baz(Object r, long n, List<?> x, String s) {
      return null;
    }

    Runnable arrays(String[] strings, int[][] ints, Map.Entry<String, String> entry) {
      return null;
    }

    Runnable noArgs() {
      return null;
    }

    <T extends Number> Runnable generic(T t, List<T> list) {
      return null;
    }

    Runnable varargs(String... names) {
      return null;
    }
  }

  public <T> Runnable registerNativeAllocation(Foo foo, Object r, long n, List<T> x) {
    return Shadow.directlyOn(foo, Foo.class).baz(r, n, x, null);
  }

  Runnable arrays(Foo foo, String[] strings, int[][] ints, Map.Entry<String, String> entry) {
    return Shadow.directlyOn(foo, Foo.class).arrays(strings, ints, entry);
  }

  Runnable noArgs(Foo foo) {
    return Shadow.directlyOn(foo, Foo.class).noArgs();
  }

  Runnable generic(Foo foo, Integer i, List<Integer> list) {
    return Shadow.directlyOn(foo, Foo.class).generic(i, list);
  }

  Runnable varargs(Foo foo) {
    return Shadow.directlyOn(foo, Foo.class).varargs("a", "b");
  }

  Foo direct(Foo foo) {
    return Shadow.directlyOn(foo, Foo.class);
  }

  Runnable newOverload(Foo foo) {
    return Shadow.directlyOn(foo, Foo.class, "noArgs");
  }

  Runnable multiline(Foo foo, Object r) {
    return Shadow.directlyOn(
            foo, Foo.class)
        .baz(r, 1L, null, "x");
  }

  @SuppressWarnings("RobolectricShadowDirectlyOn")
  Runnable suppressed(Foo foo, Object r) {
    return Shadow.directlyOn(foo, Foo.class).baz(r, 1L, null, "x");
  }
}
