package e;

import com.google.auto.value.AutoBuilder;
import com.google.auto.value.AutoOneOf;
import com.google.auto.value.AutoValue;
import javax.annotation.processing.Generated;

public class S13Auto {
  static class Plain {}

  static class Sub extends Plain {}

  @AutoValue
  abstract static class Auto extends Plain {
    @AutoValue.Builder
    abstract static class Builder {
      abstract Auto build();
    }

    @AutoValue.Builder
    interface IBuilder {
      Auto build();
    }
  }

  @AutoOneOf(Integer.class)
  abstract static class OneOf {}

  @AutoBuilder
  abstract static class Built {
    abstract Object build();
  }

  @AutoBuilder
  interface IBuilt {}

  @AutoValue
  @AutoOneOf(Integer.class)
  abstract static class Both {}

  static class BadValue extends Auto {}

  static class BadBuilder extends Auto.Builder {
    Auto build() {
      return null;
    }
  }

  static class BadInterface implements Auto.IBuilder {
    public Auto build() {
      return null;
    }
  }

  static class BadOneOf extends OneOf {}

  static class BadBuilt extends Built {
    Object build() {
      return null;
    }
  }

  static class BadIBuilt implements IBuilt {}


  interface BadIface extends IBuilt {}

  enum BadEnum implements IBuilt {
    A
  }

  record BadRecord(int x) implements IBuilt {}

  static class First extends Auto implements IBuilt {}

  static class Second extends Plain implements IBuilt {}


  @Generated("x")
  static class GeneratedOk extends Auto {}

  @Generated(value = {})
  static class EmptyGenerated extends Auto {}

  @Generated("y")
  static class OuterGenerated {
    static class Inner extends Auto {}
  }

  @SuppressWarnings("ExtendsAutoValue")
  static class Suppressed extends Auto {}

  static Object anonymous() {
    return new Auto() {};
  }

  static Object anonymousBuilder() {
    return new IBuilt() {};
  }

  static Object anonymousPlain() {
    return new Plain() {};
  }
}
