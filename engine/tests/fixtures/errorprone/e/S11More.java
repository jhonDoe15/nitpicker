package e;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;

import com.google.errorprone.annotations.CanIgnoreReturnValue;
import com.google.inject.Inject;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Iterator;
import java.util.List;
import java.util.Set;
import java.util.function.Supplier;
import org.joda.time.DateTime;
import org.joda.time.Duration;
import org.joda.time.Instant;
import org.joda.time.Interval;
import org.joda.time.LocalDate;
import org.joda.time.LocalTime;
import org.joda.time.Period;
import org.mockito.Mockito;

@SuppressWarnings("NullAway")
class S11More {
  List<String> first = new ArrayList<>();
  List<String> second = new ArrayList<>();
  static List<String> shared = new ArrayList<>();
  Set<String> set;

  S11More(List<String> firstArg, Collection<String> secondArg) {
    first.addAll(first);
    this.second.retainAll(this.second);
  }

  void params(List<String> firstArg, List<String> frist, int count, List<String> other) {
    first.containsAll(first);
    this.first.removeAll(this.first);
    shared.addAll(shared);
    Runnable r = () -> first.addAll(first);
    Object o =
        new Object() {
          List<String> inner = new ArrayList<>();

          void again(List<String> innerArg) {
            inner.addAll(inner);
            first.addAll(first);
          }
        };
  }

  void locals() {
    List<String> local = new ArrayList<>();
    local.addAll(local);
    List<String> firs = local;
    firs.addAll(firs);
    boolean r = local.removeAll(local);
    if (local.retainAll(local)) {
      return;
    }
    set.addAll(set);
  }

  void viaThis(Collection<String> items) {
    first.addAll(0, first);
    this.first.addAll(0, this.first);
  }

  void mockito() {
    S11Calls.Foo foo = mock(S11Calls.Foo.class);
    Mockito.verify(foo.execute());
    Mockito.verify(foo.get(), times(2));
    Mockito.when(foo.get());
    Mockito.verify(foo, Mockito.never());
    S11Calls.Foo two = foo;
    Mockito.verify(foo.execute(), Mockito.never());
    {
      Mockito.verify(two);
    }
    Mockito.doThrow().when(foo).get();
    Mockito.when(foo.get()).thenThrow().thenReturn(null);
  }

  Object joda(DateTime dt, Instant in, Interval iv, Period pe, Duration du, LocalDate ld, LocalTime lt) {
    new DateTime(new DateTime(dt));
    new Instant(in);
    new Interval(iv);
    new Period(pe);
    new Duration(du);
    new LocalDate(ld);
    new LocalTime(lt);
    new LocalDate(dt);
    new Duration(5L);
    dt.toDateTime().toDateTime();
    in.toInstant();
    iv.toInterval();
    pe.toPeriod();
    du.toDuration();
    return new org.joda.time.DateTime(dt);
  }

  void compares(Integer boxed, long l, char c, short s, byte b, Long bigL, double d, float f) {
    int[] results = {
      Double.compare(boxed, boxed),
      Float.compare(boxed, boxed),
      Float.compare(l, 1),
      Double.compare(bigL, 2),
      Float.compare(c, 1),
      Float.compare(c, s),
      Float.compare(c, b),
      Float.compare(s, b),
      Double.compare(c, s),
      Float.compare(f, l),
      Double.compare(l, d),
      Float.compare(boxed, 1L),
    };
  }

  void rounds(int i, long l, Integer boxed) {
    Object a = (String) String.valueOf(Math.round(-i));
    long b = Math.round(i) + 1;
    long c = Math.round(l) * 2;
    int d = Math.round(boxed == null ? 1 : boxed);
    int e = Math.round((i));
    int f = Math.round(i++);
    int g = Math.round(i = 3);
    long h = -Math.round(i);
  }

  void ncopies(Character boxedChar, Integer boxedInt, char c, int n) {
    Collections2.nCopies(c, n);
    java.util.Collections.nCopies(c, n);
    java.util.Collections.nCopies(boxedChar, boxedInt);
    java.util.Collections.nCopies(c, boxedInt);
    java.util.Collections.nCopies(n, c);
    java.util.Collections.nCopies(boxedChar, 2);
  }

  static class Collections2 {
    static List<Character> nCopies(char c, int n) {
      return null;
    }
  }

  void annotations(Class<? extends Deprecated> deprecated, Class<S11Calls.SourceOnly> source, Class<?> any) {
    S11More.class.getAnnotation(javax.annotation.processing.Generated.class);
    S11More.class.getAnnotation(Override.class);
    S11More.class.getAnnotation(SuppressWarnings.class);
    S11More.class.getAnnotation(FunctionalInterface.class);
    S11More.class.getAnnotation(Deprecated.class);
    source.getAnnotation(S11Calls.SourceOnly.class);
    deprecated.getAnnotation(Deprecated.class);
    S11More.class.getAnnotation(java.lang.annotation.Annotation.class);
  }

  <T extends java.lang.annotation.Annotation> void generic(Class<T> type) {
    S11More.class.getAnnotation(type);
  }

  void loops(int n, List<String> items) {
    for (int i = 0; i < n; ) {}
    for (int i = 0; i + 1 < n; i += 1) {}
    for (int i = 0; i < n; n--) {}
    for (int i = 0, j = 5; i < j; ) {}
    for (int i = 0, j = 5; i < j; j--) {}
    for (int i = 0; (i < 5); ) {}
    for (int i = 0; !(i > 5); ) {}
    for (int i = 0; i < 5 && n > 1; ) {}
    for (int i = 0; -i < 5; ) {}
    for (int i = 0; i < 5; ) {
      Runnable r = () -> System.err.println(i);
    }
    for (int i = 0; i < 5; ) {
      Object o =
          new Object() {
            int i = 0;

            void g() {
              i++;
            }
          };
    }
    for (int i = 0; i < n; ) {
      n = n + 1;
    }
    for (long k = 0; k < 2L; ) {
      k += 1;
    }
    for (String s = "a"; s != null; ) {
      s.length();
    }
    for (Iterator<String> it = items.iterator(); it != null; ) {
      it.next();
    }
    for (String s : items) {
      for (int w = 0; w < 3; ) {}
    }
    for (int i = 0; i < n; ) {
      for (int j = 0; j < 3; j++) {
        i++;
      }
    }
    for (boolean done = false; !done; ) {
      done = true;
    }
    for (boolean done = false; !done; ) {
      System.err.println();
    }
    for (int i = 0; i < 3; ) {
      try {
        Thread.sleep(1);
      } catch (InterruptedException e) {
        for (; n < 3; ) {}
      }
    }
  }

  Integer boxedField;
  int primitiveField;

  void ternaries(boolean b, int n, Integer boxed, long l, double d, String s) {
    int a1 = b ? (b ? null : 1) : 2;
    Integer a2 = b ? (b ? null : 1) : 2;
    a1 = b ? null : 3;
    n += b ? null : 1;
    boxed = b ? null : 1;
    primitiveField = b ? 1 : null;
    boxedField = b ? 1 : null;
    long l1 = b ? null : 1L;
    double d1 = b ? null : 1.0;
    String s1 = b ? null : "x";
    Object o1 = b ? null : 1;
    Object o2 = b ? 1 : null;
    boolean bb = (b ? null : 1) == 1;
    boolean cc = (b ? null : 1) > 1;
    boolean dd = (b ? null : 1) == boxed;
    boolean ee = (b ? null : Boolean.TRUE);
    boolean ff = b ? null : true;
    boolean gg = (b ? null : true) && b;
    int[] arr = {b ? null : 1};
    int[] arr2 = new int[b ? null : 2];
    int x = arr[b ? null : 0];
    String t = "a" + (b ? null : 1);
    long q = (b ? null : 1) + l;
    int sw = switch (n) {
      case 1 -> b ? null : 1;
      default -> 0;
    };
    Integer sw2 = switch (n) {
      case 1 -> b ? null : 1;
      default -> 0;
    };
    take(b ? null : 1);
    takeBoxed(b ? null : 1);
    takeAll(b ? null : 1, 2);
    takeAll(1, b ? null : 2);
    takeLong(b ? null : 1);
    takeObj(b ? null : 1);
    Supplier<Integer> sup = () -> b ? null : 1;
    throw b ? null : new RuntimeException();
  }

  void take(int x) {}

  void takeBoxed(Integer x) {}

  void takeAll(int... x) {}

  void takeLong(long x) {}

  void takeObj(Object x) {}

  int returns(boolean b) {
    return b ? null : 1;
  }

  Integer returnsBoxed(boolean b) {
    return b ? null : 1;
  }

  long returnsLong(boolean b) {
    if (b ? null : true) {
      return 1;
    }
    while (b ? null : true) {}
    return b ? null : 1;
  }

  static class WithInject {
    @Inject
    WithInject(String a) {}

    WithInject() {}

    @Inject
    void method() {}
  }

  @CanIgnoreReturnValue class OneLine { OneLine f() { return this; } int g() { return 1; } OneLine() {} }

  @CanIgnoreReturnValue
  static class WithBuilder {
    public WithBuilder self() { return this; }
    public WithBuilder viaVar() {
      final WithBuilder me = this;
      return me;
    }
    public WithBuilder viaVarCast() {
      WithBuilder me = (WithBuilder) this;
      return (me);
    }
    public WithBuilder mixed(boolean b) {
      WithBuilder me = this;
      if (b) {
        return me;
      }
      return this;
    }
    public WithBuilder notAllThis(boolean b) {
      if (b) {
        return this;
      }
      return null;
    }
    public Supplier<WithBuilder> lambdaReturn() {
      return () -> this;
    }
    public WithBuilder other() {
      return self().viaVar();
    }
    public static WithBuilder create() {
      return new WithBuilder();
    }
    public static <T> T generic(T value) {
      return value;
    }
    void voidMethod() {}
    class InnerClass {
      InnerClass get() {
        return this;
      }
    }
    interface Marker {
      Marker mark();
    }
    @com.google.errorprone.annotations.CheckReturnValue
    static class Checked {
      Checked get() {
        return this;
      }
    }
  }
}
