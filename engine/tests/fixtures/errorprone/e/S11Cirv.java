package e;

import com.google.auto.value.AutoValue;
import com.google.errorprone.annotations.CanIgnoreReturnValue;
import com.google.errorprone.annotations.CheckReturnValue;

class S11Cirv {
  @CanIgnoreReturnValue
  public static final class ReturnsThis {
    public ReturnsThis getValue() {
      return this;
    }
  }

  @CanIgnoreReturnValue
  public static final class ReturnsCast {
    public ReturnsCast getValue() {
      return ((ReturnsCast) (this));
    }
  }

  @CanIgnoreReturnValue
  public static final class ReturnsSelf {
    public ReturnsSelf getValue() {
      return self();
    }

    private ReturnsSelf self() {
      return this;
    }
  }

  @CanIgnoreReturnValue
  public static final class ReturnsGetThis {
    public ReturnsGetThis getValue() {
      return getThis();
    }

    private ReturnsGetThis getThis() {
      return this;
    }
  }

  @CanIgnoreReturnValue
  public static final class ReturnsNew {
    public ReturnsNew getValue() {
      return new ReturnsNew();
    }
  }

  @CanIgnoreReturnValue
  public static final class ExplicitConstructor {
    ExplicitConstructor() {}

    public ExplicitConstructor getValue() {
      return this;
    }
  }

  @CanIgnoreReturnValue
  public static final class WithNested {
    public WithNested getValue() {
      return this;
    }

    @CheckReturnValue
    public static final class Nested {
      public int getValue() {
        return 42;
      }
    }
  }

  @CanIgnoreReturnValue
  public static final class BothCirv {
    public BothCirv persist() {
      return this;
    }

    public static final class Builder {
      public Builder setFirstName(String firstName) {
        return this;
      }
    }
  }

  @AutoValue
  @CanIgnoreReturnValue
  abstract static class Animal {
    abstract String name();

    @AutoValue.Builder
    abstract static class Builder {
      abstract Builder setName(String value);

      abstract Animal build();
    }
  }

  @CanIgnoreReturnValue
  @CheckReturnValue
  public static final class BothAnnotations {
    public BothAnnotations getValue() {
      return this;
    }
  }

  @CanIgnoreReturnValue
  public static final class Mixed {
    private final Mixed me = this;

    public void nothing() {}

    public Mixed viaLocal() {
      final Mixed local = this;
      return local;
    }

    public Mixed viaReassigned() {
      Mixed local = this;
      local = new Mixed();
      return local;
    }

    public Mixed two(boolean b) {
      if (b) {
        return this;
      }
      return new Mixed();
    }

    @CanIgnoreReturnValue
    public Mixed already() {
      return this;
    }

    @CheckReturnValue
    public Mixed checked() {
      return this;
    }

    public Runnable lambda() {
      return () -> {};
    }

    public Object anonymous() {
      return new Object() {
        public Object inside() {
          return this;
        }
      };
    }

    public int number() {
      return 1;
    }

    public Mixed noReturn() {
      throw new IllegalStateException();
    }
  }

  @CanIgnoreReturnValue
  public enum Kind {
    A,
    B;

    public Kind next() {
      return this;
    }
  }

  @CanIgnoreReturnValue
  public record Pair(int a, int b) {
    public Pair {
    }

    public Pair swap() {
      return new Pair(b, a);
    }
  }

  @CanIgnoreReturnValue
  public interface Fluent {
    Fluent next();

    default Fluent self() {
      return this;
    }
  }

  public static final class NoAnnotation {
    public NoAnnotation getValue() {
      return this;
    }
  }

  @SuppressWarnings("NoCanIgnoreReturnValueOnClasses")
  @CanIgnoreReturnValue
  public static final class Quiet {
    public Quiet getValue() {
      return this;
    }
  }
}
