package e;

import com.google.common.collect.Maps;
import com.google.common.math.DoubleMath;
import java.lang.annotation.Annotation;
import java.nio.file.Path;
import java.util.Collections;
import java.util.HashMap;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.concurrent.ConcurrentSkipListMap;
import java.util.function.Consumer;
import java.util.stream.Stream;

class S10Fuzzy {
  public boolean equals(Object o) {
    DoubleMath.fuzzyEquals(0.2, 9.3, 2.0);
    return true;
  }

  private class Inner {
    public boolean equals(Object other) {
      double x = 0, y = 0, z = 0;
      return DoubleMath.fuzzyEquals(x, y, z);
    }
  }

  private static class Fine {
    public void test() {
      boolean t = DoubleMath.fuzzyEquals(0, 2, 0.3);
    }

    public boolean equals(Object other) {
      return true;
    }

    public boolean equals(Object other, double a) {
      return DoubleMath.fuzzyEquals(0, 1, 0.2);
    }
  }

  @SuppressWarnings("FuzzyEqualsShouldNotBeUsedInEqualsMethod")
  static class Suppressed {
    public boolean equals(Object o) {
      return DoubleMath.fuzzyEquals(1, 2, 3);
    }
  }

  static class Lambda {
    public boolean equals(Object o) {
      java.util.function.BooleanSupplier s = () -> DoubleMath.fuzzyEquals(1, 2, 3);
      return s.getAsBoolean();
    }
  }
}

class S10AnnotationClass {
  void f(Deprecated deprecated, Annotation annotation, Object o) {
    System.err.println(deprecated.getClass());
    System.err.println(annotation.getClass());
    System.err.println(this.getClass());
    System.err.println(o.getClass());
    Class<?> c = annotation.getClass();
  }

  @SuppressWarnings("GetClassOnAnnotation")
  void suppressed(Deprecated deprecated) {
    System.err.println(deprecated.getClass());
  }

  interface AnnotationLiteral extends Annotation {
    @Override
    @SuppressWarnings("unchecked")
    default Class<? extends Annotation> annotationType() {
      return (Class<? extends Annotation>)
          Stream.of(getClass().getInterfaces())
              .filter(Annotation.class::isAssignableFrom)
              .filter(iface -> !iface.equals(AnnotationLiteral.class))
              .findFirst()
              .orElseThrow();
    }
  }
}

class S10IdentityBoxing {
  void test() {
    Map<Integer, String> map1 = new IdentityHashMap<>();
    Map<Float, String> map2 = new IdentityHashMap<>();
    Map<Double, String> map3 = new IdentityHashMap<>();
    Map<Long, String> map4 = new IdentityHashMap<>();
    Map<Short, String> map5 = new IdentityHashMap<>();
    Map<Integer, String> map6 = Maps.newIdentityHashMap();
    Map<Float, String> map7 = Maps.newIdentityHashMap();
    Map<Double, String> map8 = Maps.newIdentityHashMap();
    Map<Long, String> map9 = Maps.newIdentityHashMap();
    Map<String, Integer> n1 = new IdentityHashMap<>();
    Map<String, Float> n2 = new IdentityHashMap<>();
    Map<Object, String> n3 = new IdentityHashMap<>();
    Map<String, Integer> n4 = Maps.newIdentityHashMap();
    Map<Object, String> n5 = Maps.newIdentityHashMap();
    Map<Character, String> n6 = new IdentityHashMap<>();
    IdentityHashMap<Integer, String> m10 = new IdentityHashMap<Integer, String>();
    var m11 = new IdentityHashMap<Long, String>();
    Object raw = new IdentityHashMap();
  }

  @SuppressWarnings("IdentityHashMapBoxing")
  void suppressed() {
    Map<Integer, String> map1 = new IdentityHashMap<>();
  }
}

class S10IndexOf {
  {
    "".indexOf(0, '$');
    "".lastIndexOf(0, '$');
    "".indexOf('$', 0);
    "".indexOf('a');
    "".indexOf("a", 0);
    char c = 'x';
    int i = 3;
    "".indexOf(i, c);
    "".indexOf(Integer.valueOf(1), Character.valueOf('c'));
    "".indexOf(i, i);
    "abc".indexOf(65, 'x');
  }

  @SuppressWarnings("IndexOfChar")
  void suppressed() {
    "".indexOf(0, '$');
  }
}

class S10Inexact {
  public static void main(String[] args) {
    Object[] a = {1, 2};
    Object b = "hello";
    for (boolean flag : new boolean[] {true, false}) {
      f(0, flag ? a : b);
      f(0, flag ? b : a);
      f(0, 1, flag ? a : b);
      f(0, flag ? a : a);
      f(0, flag ? b : b);
      g(flag ? "a" : args);
    }
    f(0, a);
    f(0, b);
  }

  static void f(int x, Object... xs) {
    System.err.println(java.util.Arrays.deepToString(xs));
  }

  static void g(Object... xs) {}

  static void h(Object[]... xs) {}

  @SuppressWarnings("InexactVarargsConditional")
  static void suppressed(boolean flag, Object[] a, Object b) {
    f(0, flag ? a : b);
  }
}

final class S10Incomparable {
  void f() {
    new TreeMap<S10Incomparable, String>();
    new TreeSet<S10Incomparable>();
    Set<S10Incomparable> xs = Collections.synchronizedSet(new TreeSet<>());
    new ConcurrentSkipListMap<S10Incomparable, String>();
    new TreeMap<String, S10Incomparable>();
    new TreeSet<String>();
    Set<String> ys = Collections.synchronizedSet(new TreeSet<>());
    Map<S10Incomparable, String> m = new TreeMap<>();
    TreeSet<Runnable> r = new TreeSet<>();
    TreeSet<Object> o = new TreeSet<>();
    TreeSet<Integer> i = new TreeSet<>();
    TreeSet<Comparable<String>> cmp = new TreeSet<>();
    new TreeSet<>(new java.util.ArrayList<S10Incomparable>());
    new TreeMap<S10Incomparable, String>(new HashMap<S10Incomparable, String>());
    new TreeMap<S10Incomparable, String>(java.util.Comparator.comparing(Object::toString));
    new TreeSet();
  }

  @SuppressWarnings("Incomparable")
  void suppressed() {
    new TreeSet<S10Incomparable>();
  }
}

class S10IsInstance {
  Optional<String> f(Optional<String> s) {
    return s.filter(Integer.class::isInstance);
  }

  Optional<String> g(Optional<String> s) {
    return s.filter(x -> Integer.class.isInstance(x));
  }

  Optional<HashMap<String, Integer>> h(Optional<HashMap<String, Integer>> m) {
    return m.filter(Integer.class::isInstance);
  }

  <T extends Number> Optional<T> i(Optional<T> t) {
    return t.filter(String.class::isInstance);
  }

  Optional<HashMap> j(Optional<HashMap> m) {
    return m.filter(LinkedHashMap.class::isInstance);
  }

  Optional<HashMap> k(Optional<HashMap> m) {
    return m.filter(x -> LinkedHashMap.class.isInstance(x));
  }

  <T> Optional<T> l(Optional<T> t) {
    return t.filter(Object.class::isInstance);
  }

  boolean m(Object o, Class c) {
    return c.isInstance(o);
  }

  <T> Optional<T> n(Optional<T> t, Class c) {
    return t.filter(c::isInstance);
  }

  boolean o(String s) {
    return Integer.class.isInstance(s);
  }

  boolean p(String s, Class<Integer> c) {
    return c.isInstance(s);
  }

  boolean q(Runnable r) {
    return String.class.isInstance(r);
  }

  boolean r(CharSequence r) {
    return String.class.isInstance(r);
  }

  boolean s(Integer r) {
    return Number.class.isInstance(r);
  }

  boolean t(int r) {
    return Number.class.isInstance(r);
  }

  @SuppressWarnings("IsInstanceIncompatibleType")
  boolean suppressed(String s) {
    return Integer.class.isInstance(s);
  }
}

class S10IterablePath {
  void f(Iterable<? extends Path> xs) {}

  void g(Iterable<? super Path> xs) {}

  void h(Iterable<Path> xs) {}

  void i(java.util.Collection<Path> xs) {}

  void raw(Iterable xs) {}

  void other(Iterable<String> xs) {}

  void field() {
    Iterable<Path> local = null;
    for (Iterable<Path> each : new Iterable[0]) {}
  }

  Iterable<Path> notParameter;
  Consumer<Iterable<Path>> c = (paths) -> {};
  Consumer<Iterable<Path>> d = (Iterable<Path> paths) -> {};

  void catching(Iterable<Path>... varargs) {}

  S10IterablePath(Iterable<Path> constructorArg) {}

  @SuppressWarnings("IterablePathParameter")
  void suppressed(Iterable<Path> xs) {}
}
