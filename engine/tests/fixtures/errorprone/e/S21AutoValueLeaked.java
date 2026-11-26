import com.google.auto.value.AutoValue;

class S21AvOwner {
  @AutoValue
  abstract static class Foo {
    abstract int foo();

    @AutoValue.Builder
    abstract static class Builder {
      abstract Foo build();
    }

    static Foo create() {
      return new AutoValue_S21AvOwner_Foo();
    }

    static Builder builder() {
      return new AutoValue_S21AvOwner_Foo.Builder();
    }
  }
}

final class AutoValue_S21AvOwner_Foo extends S21AvOwner.Foo {
  int foo() {
    return 1;
  }

  static final class Builder extends S21AvOwner.Foo.Builder {
    S21AvOwner.Foo build() {
      return new AutoValue_S21AvOwner_Foo();
    }
  }
}

abstract class $$AutoValue_S21AvExt extends S21AvExtBase {}

@AutoValue
abstract class S21AvExtBase {
  static S21AvExtBase create() {
    return new $$AutoValue_S21AvExt() {};
  }
}

