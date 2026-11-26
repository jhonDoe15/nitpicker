package e;

import com.google.auto.factory.AutoFactory;
import com.google.auto.value.AutoValue;
import dagger.Provides;
import javax.annotation.Nullable;
import javax.inject.Inject;

class S9AutoFactory {
  @AutoFactory
  static class OnClass {
    @Inject
    OnClass() {}
  }

  @AutoFactory
  static class UsesGuice {
    @com.google.inject.Inject
    UsesGuice() {}
  }

  static class OnConstructor {
    @Inject
    @AutoFactory
    OnConstructor() {}
  }

  static class OnConstructorFirst {
    @AutoFactory
    @Inject
    OnConstructorFirst() {}
  }

  @AutoFactory
  static class AtInjectOnInnerType {
    static class InnerType {
      @Inject
      InnerType() {}
    }
  }

  static class AutoFactoryOnInnerType {
    @Inject
    AutoFactoryOnInnerType() {}

    @AutoFactory
    static class InnerType {}
  }

  static class OnDifferentConstructors {
    @Inject
    OnDifferentConstructors(String string) {}

    @AutoFactory
    OnDifferentConstructors(Object object) {}
  }

  @AutoFactory
  static class OnMethod {
    @Inject
    void method() {}

    @Inject
    String field;
  }

  @AutoFactory
  static class Two {
    @Inject
    Two() {}

    @Inject
    Two(int x) {}
  }

  @AutoFactory
  @SuppressWarnings("AutoFactoryAtInject")
  static class Suppressed {
    @Inject
    Suppressed() {}
  }

  @AutoFactory
  static class WithArguments {
    @Inject()
    WithArguments() {}
  }
}

class S9Provides {
  @Provides
  String a() {
    return null;
  }

  @Provides
  @Nullable
  String b() {
    return null;
  }

  @Provides
  String c(int x) {
    if (x > 1) {
      return "x";
    }
    return null;
  }

  @Provides
  String d() {
    try {
      return "x";
    } catch (RuntimeException e) {
      return null;
    }
  }

  String notProvides() {
    return null;
  }

  @Provides
  Object lambda() {
    java.util.function.Supplier<String> s = () -> {
      return null;
    };
    return s;
  }

  @Provides
  Object anonymous() {
    return new Object() {
      Object f() {
        return null;
      }
    };
  }

  @Provides
  @SuppressWarnings("DaggerProvidesNull")
  String suppressed() {
    return null;
  }

  @Provides
  String maybe(boolean b) {
    return b ? null : "x";
  }

  @Provides
  @javax.annotation.Nullable
  String qualifiedNullable() {
    return null;
  }

  @Provides
  void nothing() {
    return;
  }

  @Provides
  String nestedCatch() {
    try {
      return "x";
    } catch (IllegalStateException | IllegalArgumentException e) {
      try {
        return "y";
      } catch (RuntimeException inner) {
        return null;
      }
    }
  }
}

class S9ChainingOne {
  static class MissileLauncher {
    MissileLauncher(Location target, boolean askForConfirmation) {}

    MissileLauncher(Location target) {
      this(target, false);
    }

    MissileLauncher(boolean askForConfirmation) {
      this(Location.TEST_TARGET, false);
    }
  }

  static class SuppressedCallee {
    @SuppressWarnings("ChainingConstructorIgnoresParameter")
    SuppressedCallee(String foo, boolean bar) {}

    SuppressedCallee(String foo) {
      this("default", false);
    }
  }

  static class CallerBeforeCallee {
    CallerBeforeCallee(String foo) {
      this("default", false);
    }

    CallerBeforeCallee(String foo, boolean bar) {}
  }

  static class AssignableButNotEqual {
    AssignableButNotEqual(Object foo, boolean bar) {}

    AssignableButNotEqual(String foo) {
      this("default", false);
    }
  }

  static class HasNestedClassCallerFirst {
    HasNestedClassCallerFirst(String foo) {
      this("somethingElse", false);
    }

    static class NestedClass {}

    HasNestedClassCallerFirst(String foo, boolean bar) {}
  }

  static class MultipleQueuedErrors {
    MultipleQueuedErrors(Location target) {
      this(Location.TEST_TARGET, false);
    }

    MultipleQueuedErrors(boolean askForConfirmation) {
      this(Location.TEST_TARGET, false);
    }

    MultipleQueuedErrors(Location target, boolean askForConfirmation) {}
  }

  enum Location {
    TEST_TARGET
  }
}

class S9ChainingTwo {
  static class ExplicitNoArgThisCall {
    ExplicitNoArgThisCall() {}

    ExplicitNoArgThisCall(String foo) {
      this();
    }
  }

  static class ParameterNotAvailable {
    ParameterNotAvailable(String foo, boolean bar) {}

    ParameterNotAvailable(String foo) {
      this(foo, false);
    }
  }

  static class ParameterDifferentType {
    ParameterDifferentType(java.io.File foo) {}

    ParameterDifferentType(String foo) {
      this(new java.io.File("/tmp"));
    }
  }

  static class ParameterUsedInExpression {
    ParameterUsedInExpression(String foo, boolean bar) {}

    ParameterUsedInExpression(String foo) {
      this(foo.substring(0), false);
    }
  }

  static class HasNestedClass {
    HasNestedClass(String foo) {
      this("somethingElse", false);
    }

    static class NestedClass {
      NestedClass(String foo, boolean bar) {}
    }

    HasNestedClass(String notFoo, boolean bar) {}
  }

  static class HasNestedClassesWithSameName {
    static class Outer1 {
      static class Inner {
        Inner(String foo, boolean bar) {}
      }
    }

    static class Outer2 {
      static class Inner {
        Inner(String foo) {
          this("somethingElse", false);
        }

        Inner(String notFoo, boolean bar) {}
      }
    }
  }

  class NonStaticClass {
    NonStaticClass(String foo, boolean bar) {}

    NonStaticClass(String foo) {
      this(foo, false);
    }
  }

  static class Varargs1 {
    Varargs1(String foo, boolean... bar) {}

    Varargs1() {
      this("something", false, false);
    }
  }

  static class Varargs2 {
    Varargs2(String foo, boolean... bar) {}

    Varargs2() {
      this("something");
    }
  }

  static class Varargs3 {
    Varargs3(boolean flag, String foo, boolean... bar) {}

    Varargs3(String foo) {
      this(true, "something", false);
    }
  }

  static class SuppressedCaller {
    SuppressedCaller(String foo, boolean bar) {}

    @SuppressWarnings("ChainingConstructorIgnoresParameter")
    SuppressedCaller(String foo) {
      this("default", false);
    }
  }

  @SuppressWarnings("ChainingConstructorIgnoresParameter")
  static class SuppressedClass {
    SuppressedClass(String foo, boolean bar) {}

    SuppressedClass(String foo) {
      this("default", false);
    }
  }

  static class TwoParams {
    TwoParams(String foo, int bar, boolean baz) {}

    TwoParams(String foo, int bar) {
      this("x", 0, false);
    }
  }

  static class Generic<T> {
    Generic(T value, int x) {}

    Generic(T value) {
      this(null, 1);
    }
  }

  static class Primitive {
    Primitive(int count, String name) {}

    Primitive(long count) {
      this(0, "x");
    }

    Primitive(int count) {
      this(0, "x");
    }
  }

  static class Enclosing {
    Enclosing(String foo, int bar) {}

    Enclosing(String foo) {
      this(new Object() {
        public String toString() {
          return "x";
        }
      }.toString(), 1);
    }
  }
}
