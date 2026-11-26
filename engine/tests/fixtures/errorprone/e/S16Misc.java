import com.google.inject.AbstractModule;
import com.google.inject.Binder;
import com.google.inject.BindingAnnotation;
import com.google.inject.Module;
import com.google.inject.Provides;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.Objects;
import java.util.stream.Collector;
import org.junit.runner.RunWith;
import org.junit.runners.JUnit4;

class S16Misc {
  void bigDecimals(BigDecimal a, BigDecimal b, Object o, String s, int i) {
    a.equals(b);
    a.equals(o);
    o.equals(a);
    Objects.equals(a, b);
    Objects.equals(a, o);
    Objects.equals(o, a);
    com.google.common.base.Objects.equal(a, b);
    boolean x = a.equals(null);
    boolean y = a.equals(i);
    boolean z = s.equals(o);
    boolean w = Objects.equals(s, o);
    boolean v = a.compareTo(b) == 0;
    boolean u = a.equals(b) && o.equals(s);
  }

  <T extends BigDecimal> boolean generic(T t, BigDecimal b) {
    return t.equals(b);
  }

  @SuppressWarnings("BigDecimalEquals")
  boolean suppressed(BigDecimal a, BigDecimal b) {
    return a.equals(b);
  }

  static class Money {
    BigDecimal amount;

    @Override
    public boolean equals(Object other) {
      return amount.equals(((Money) other).amount) && Objects.equals(amount, ((Money) other).amount);
    }

    @Override
    public int hashCode() {
      return 1;
    }

    boolean other(Money m) {
      return amount.equals(m.amount);
    }

    public boolean equals(Money m) {
      return amount.equals(m.amount);
    }

    boolean lambda(Money m) {
      Object anon =
          new Object() {
            @Override
            public boolean equals(Object o) {
              return amount.equals(m.amount);
            }
          };
      return ((java.util.function.BooleanSupplier) () -> amount.equals(m.amount)).getAsBoolean();
    }
  }

  void collectors() {
    Collector.of(
        () -> new int[1],
        (a, t) -> a[0]++,
        (a, b) -> a,
        a -> a[0]);
    Collector.of(
        () ->
            new Object() {
              int count;
            },
        (a, t) -> {},
        (a, b) -> a,
        a -> 1);
    Collector.of(
        () ->
            new Object() {
              final int count = 1;
            },
        (a, t) -> {},
        (a, b) -> a,
        a -> 1);
    Collector.of(
        () -> new Object() {},
        (a, t) -> {},
        (a, b) -> a,
        a -> 1);
    Collector.of(
        () -> new StringBuilder(),
        (a, t) -> {},
        (a, b) -> a,
        a ->
            new Object() {
              static int x;
              int y, z;
            });
  }

  @SuppressWarnings("CollectorShouldNotUseState")
  void collectorsSuppressed() {
    Collector.of(() -> new Object() { int count; }, (a, t) -> {}, (a, b) -> a, a -> 1);
  }

  class Module1 extends AbstractModule {
    @Override
    protected void configure() {
      bind(Integer.class).toInstance(2);
      bind(String.class).toInstance("Hello");
      bind(Double.class).toProvider(() -> 42.0);
      binder().bind(Long.class).toInstance(42L);
      bind(int.class).toInstance(1);
      bind(Duration.class).toInstance(Duration.ZERO);
      bind(Instant.class).to(Instant.class);
      bind(BigDecimal.class).toInstance(BigDecimal.ONE);
      bind(Object.class).toInstance("x");
      bind(Integer.class).annotatedWith(Marker.class).toInstance(42);
      bind(A.class).toInstance(new A());
      bind(Void.class).toInstance(null);
    }

    @Provides
    int providesFoo() {
      return 42;
    }

    @Provides
    Integer provideBoxedFoo() {
      return 42;
    }

    @Provides
    String providesGreeting() {
      return "hi";
    }

    @Provides
    Duration providesDuration() {
      return null;
    }

    @Provides
    @Marker
    int qualified() {
      return 1;
    }

    @Provides
    java.util.List<Integer> list() {
      return null;
    }

    @Provides
    int[] array() {
      return null;
    }

    @Provides
    Object object() {
      return null;
    }

    @Provides
    void nothing() {}

    @SuppressWarnings("BindingToUnqualifiedCommonType")
    @Provides
    long suppressed() {
      return 1;
    }

    int notProvides() {
      return 1;
    }
  }

  class Module2 implements Module {
    @Override
    public void configure(Binder binder) {
      binder.bind(String.class).toInstance("x");
      binder.bind(A.class).toInstance(new A());
    }

    @Provides
    @Marker
    int providesFoo() {
      return 42;
    }
  }

  @RunWith(JUnit4.class)
  static class MyTestClass {
    class Module3 extends AbstractModule {
      @Override
      protected void configure() {
        bind(Integer.class).toInstance(2);
      }

      @Provides
      int providesFoo() {
        return 42;
      }
    }
  }

  class A {}

  @BindingAnnotation
  @java.lang.annotation.Retention(java.lang.annotation.RetentionPolicy.RUNTIME)
  @interface Marker {}
}
