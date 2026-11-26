import static org.junit.Assert.assertThrows;

import java.util.Optional;
import javax.annotation.Nullable;

class S18Optional {
  void a(Optional<Object> o) {}

  void b(@Nullable Optional<Object> o) {}

  void c(com.google.common.base.Optional<String> g) {}

  void d(int a, String s) {}

  @SafeVarargs
  private final void varargs(int a, Optional<Object>... o) {}

  S18Optional(Optional<String> o) {}

  S18Optional() {
    this(null);
  }

  void nullOptional() {
    a(null);
    b(null);
    a(Optional.empty());
    c(null);
    d(1, null);
    varargs(1, Optional.empty(), null);
    varargs(1, null);
    varargs(1);
    new S18Optional(null);
    new S18Optional(Optional.empty()) {};
    assertThrows(NullPointerException.class, () -> a(null));
    Runnable r = () -> a(null);
    Object anonymous = new Object() {
      void inner() {
        a(null);
      }
    };
  }

  static class Thrower implements org.junit.function.ThrowingRunnable {
    void a(Optional<Object> o) {}

    public void run() {
      a(null);
    }
  }

  @SuppressWarnings("NullOptional")
  void nullOptionalSuppressed() {
    a(null);
  }

  @Nullable Optional<String> nullableMethod() {
    return null;
  }

  @Nullable com.google.common.base.Optional<String> nullableGuava() {
    return null;
  }

  @Nullable String nullableString() {
    return null;
  }

  Optional<String> plainOptional() {
    return Optional.empty();
  }

  @Nullable Optional<String> field;

  @Nullable Optional<String> first, second;

  @Nullable String stringField;

  @Nullable Optional<String>[] array;

  void nullableLocals(@Nullable Optional<String> param, @Nullable String other, Optional<String> plain) {
    @Nullable Optional<String> local = null;
    @Nullable String text = null;
    for (@Nullable Optional<String> each : java.util.List.<Optional<String>>of()) {}
  }

  @interface Nullable2 {}

  @Nullable2 Optional<String> notNullable;

  record Rec(@Nullable Optional<String> value) {}

  @SuppressWarnings("NullableOptional")
  @Nullable Optional<String> suppressedNullable() {
    return null;
  }

  static class Ctors {
    @Nullable
    Ctors() {}

    @javax.annotation.Nullable
    Ctors(int x) {}

    @SuppressWarnings("NullableConstructor") @Nullable
    Ctors(String s) {}

    Ctors(long l) {}

    @Nullable String method() {
      return null;
    }
  }

  boolean mapToOptional(Optional<Integer> optional, com.google.common.base.Optional<Integer> guava, Optional raw) {
    boolean a = optional.map(i -> Optional.of(1)).isPresent();
    boolean b = guava.transform(i -> com.google.common.base.Optional.of(1)).isPresent();
    Optional<Optional<Integer>> c = optional.map(i -> Optional.of(1));
    Optional<Integer> d = optional.flatMap(i -> Optional.of(1));
    Optional<Integer> e = optional.map(i -> 1);
    Optional<Integer> f = raw.map(i -> 1);
    Optional<?> g = optional.map(i -> Optional.of(1));
    Optional<Object> h = optional.map(i -> Optional.of(1));
    Object j = optional.map(i -> Optional.of(1));
    var k = optional.map(i -> Optional.of(1));
    optional.map(i -> Optional.of(1)).get();
    optional.map(i -> Optional.of(1)).orElse(null);
    optional.map(i -> Optional.of(i)).map(x -> x);
    optional.map(x -> optional.map(y -> Optional.of(y)).isPresent());
    optional.map(x -> Optional.empty());
    optional.map(Optional::of);
    optional.map(this::wrap);
    return a || b;
  }

  Optional<Integer> wrap(Integer i) {
    return Optional.of(i);
  }

  @SuppressWarnings("OptionalMapToOptional")
  Object mapSuppressed(Optional<Integer> optional) {
    return optional.map(i -> Optional.of(1));
  }
}
