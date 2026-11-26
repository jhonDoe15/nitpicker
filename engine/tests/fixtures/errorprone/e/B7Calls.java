package e;

import java.util.Hashtable;
import java.util.concurrent.ConcurrentHashMap;
import java.util.List;

class B7Calls {
  static class Fixed extends Hashtable<String, Integer> {
    boolean has(Integer value) {
      return contains(value);
    }
  }

  boolean tables(Hashtable<String, Integer> table, ConcurrentHashMap<String, String> same, Hashtable raw, Hashtable<Object, Object> objects) {
    boolean a = table.contains(1);
    boolean b = table.contains("key");
    boolean c = same.contains("x");
    boolean d = raw.contains("x");
    boolean e = objects.contains("x");
    boolean f = table.containsKey("x");
    return a || b || c || d || e || f;
  }

  boolean equalsNull(Object x, String s) {
    boolean a = x.equals(null);
    boolean b = !x.equals(null);
    boolean c = !(x.equals(null));
    boolean d = s.equals(null);
    boolean e = x.equals(s);
    boolean f = this.equals(null);
    if (a && s.equals(null)) {
      return !s.equals(null) || e;
    }
    return b || c || d || f;
  }

  @SuppressWarnings("EqualsNull")
  boolean suppressed(Object x) {
    return x.equals(null);
  }

  Class<?> classes(Class<?> c, Object o, Class<String> d) {
    Class<?> a = c.getClass();
    Class<?> b = o.getClass();
    Class<?> e = d.getClass();
    return a == b ? e : c.getClass().getClass();
  }

  <T> T generic() {
    return null;
  }

  static <T> T identity(T t) {
    return t;
  }

  static void plain() {}

  class Base {
    <T> void over() {}
    void flat() {}
    <T> void erased() {}
  }

  class Derived extends Base {
    void flat() {}
    <T> void over() {}
    void erased() {}
  }

  void typeArguments(Derived derived, List<String> list) {
    this.<String>generic();
    B7Calls.<String>identity("a");
    B7Calls.<String>plain();
    derived.<String>flat();
    derived.<String>over();
    derived.<String>erased();
    list.<String>size();
    list.<List<String>>isEmpty();
    B7Calls.</*c*/String>plain();
  }
}
