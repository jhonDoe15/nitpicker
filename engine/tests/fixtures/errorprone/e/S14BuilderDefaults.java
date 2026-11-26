package e;

import com.google.auto.value.AutoValue;

class S14BuilderNegative {
  @AutoValue.Builder
  abstract class Builder {
    Builder() {}

    abstract void setFoo(int foo);
  }
}

@AutoValue
abstract class S14BuilderPositive {
  abstract int foo();

  static Builder builder() {
    return new AutoValue_S14BuilderPositive.Builder();
  }

  static Builder other() {
    return new AutoValue_S14BuilderPositive.Builder();
  }

  @AutoValue.Builder
  abstract static class Builder {
    Builder() {
      this.setFoo(1);
      setBar(2);
    }

    abstract Builder setFoo(int foo);

    abstract Builder setBar(int bar);

    abstract S14BuilderPositive build();
  }
}

class AutoValue_S14BuilderPositive extends S14BuilderPositive {
  int foo() {
    return 1;
  }

  static final class Builder extends S14BuilderPositive.Builder {
    S14BuilderPositive.Builder setFoo(int foo) {
      return this;
    }

    S14BuilderPositive.Builder setBar(int bar) {
      return this;
    }

    S14BuilderPositive build() {
      return null;
    }
  }
}

@AutoValue
abstract class S14BuilderOdd {
  static Builder builder() {
    return new Builder() {
      Builder setFoo(int foo) {
        return this;
      }

      S14BuilderOdd build() {
        return null;
      }
    };
  }

  @AutoValue.Builder
  abstract static class Builder {
    Builder() {
      doSomethingOdd();
    }

    void doSomethingOdd() {}

    abstract Builder setFoo(int foo);

    abstract S14BuilderOdd build();
  }
}

@AutoValue
abstract class S14BuilderMixed {
  @AutoValue.Builder
  abstract static class Builder {
    Builder() {
      doSomethingOdd();
      setFoo(3);
      System.out.println();
      this.setFoo(4);
    }

    void doSomethingOdd() {}

    abstract Builder setFoo(int foo);
  }

  static Builder make(Builder base) {
    return new Builder() {
      Builder setFoo(int foo) {
        return this;
      }
    };
  }
}

@AutoValue
abstract class S14BuilderSuppressed {
  @AutoValue.Builder
  abstract static class Builder {
    @SuppressWarnings("AutoValueBuilderDefaultsInConstructor")
    Builder() {
      setFoo(1);
    }

    abstract Builder setFoo(int foo);
  }
}
