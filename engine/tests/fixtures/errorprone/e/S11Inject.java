package e;

import static java.lang.annotation.RetentionPolicy.RUNTIME;
import static java.lang.annotation.RetentionPolicy.SOURCE;

import com.google.inject.BindingAnnotation;
import com.google.inject.Provides;
import com.google.inject.ScopeAnnotation;
import java.beans.ConstructorProperties;
import java.lang.annotation.Retention;
import javax.inject.Inject;
import javax.inject.Named;
import javax.inject.Qualifier;
import javax.inject.Scope;
import javax.inject.Singleton;

class S11Inject {
  abstract class AbstractInject1 {
    @javax.inject.Inject
    abstract void abstractMethod();
  }

  abstract class AbstractInject2 {
    @javax.inject.Inject
    abstract void abstractMethod();

    public void foo() {}
  }

  abstract class AbstractInject3 {
    @javax.inject.Inject
    abstract void abstractMethod1();

    abstract void abstractMethod2();
  }

  interface InjectedInterface {
    @javax.inject.Inject
    void abstractMethod();
  }

  class Implementing implements InjectedInterface {
    public void abstractMethod() {}
  }

  abstract class AbstractImplementing implements InjectedInterface {
    @javax.inject.Inject
    public abstract void abstractMethod();
  }

  interface HasDefault {
    @javax.inject.Inject
    default void foo() {}

    @Inject @Deprecated
    default void bar() {}
  }

  class ConcreteInject {
    @Inject
    public void foo() {}
  }

  abstract class GuiceAbstract {
    @com.google.inject.Inject
    abstract void abstractMethod();
  }

  abstract class SuppressedAbstract {
    @SuppressWarnings("JavaxInjectOnAbstractMethod")
    @javax.inject.Inject
    abstract void abstractMethod();
  }

  class MisplacedScopes {
    @Inject
    void someMethod(@Singleton String foo) {}

    @Provides
    String provideString(@Singleton @Named("foo") String foo) {
      return foo;
    }

    @Inject
    MisplacedScopes(@Singleton @Named("bar") String bar) {}

    @Inject
    MisplacedScopes(@Singleton String bar, Integer i, @Singleton Long c) {}

    @Inject @Singleton String field;

    @Inject @Singleton @Named("n") String field2;

    @Singleton String notInjected;

    @Provides
    @Singleton
    @Named("bar")
    int something(@Named("bar") Integer bar) {
      return 42;
    }

    @Qualifier
    @Scope
    @Retention(RUNTIME)
    @interface RequestScoped {}

    @Provides
    int both(@RequestScoped Integer bar) {
      return 42;
    }

    @Inject
    @RequestScoped
    String fieldBoth;

    void noInject(@Singleton String foo) {}
  }

  @Scope
  @Retention(SOURCE)
  public @interface SourceScope {}

  @ScopeAnnotation
  @Retention(SOURCE)
  public @interface SourceGuiceScope {}

  @Qualifier
  @Retention(SOURCE)
  public @interface SourceQualifier {}

  @BindingAnnotation
  @Retention(SOURCE)
  public @interface SourceBinding {}

  @BindingAnnotation
  public @interface DefaultBinding {}

  @dagger.MapKey
  public @interface DaggerKey {}

  @com.google.inject.multibindings.MapKey
  public @interface GuiceKey {}

  @Scope
  @Retention(RUNTIME)
  public @interface RuntimeScope {}

  @Retention(SOURCE)
  public @interface PlainSource {}

  @dagger.MapKey
  @Retention(RUNTIME)
  public @interface RuntimeKey {}

  @Scope
  @SuppressWarnings("MissingRuntimeRetention")
  public @interface SuppressedScope {}

  @dagger.Module
  static class DaggerModule {
    @Scope
    public @interface InModule {}

    @Scope
    @Retention(SOURCE)
    public @interface SourceInModule {}
  }

  public class TwoConstructors {
    @com.google.inject.Inject
    public TwoConstructors() {}

    @com.google.inject.Inject
    public TwoConstructors(int n) {}
  }

  public class ThreeConstructors {
    @com.google.inject.Inject
    public ThreeConstructors() {}

    public ThreeConstructors(int n) {}

    @com.google.inject.Inject
    public ThreeConstructors(String s) {}
  }

  public class WithOther {
    @com.google.inject.Inject
    public WithOther() {}

    @javax.inject.Inject
    @ConstructorProperties({"m", "n"})
    public WithOther(int m, int n) {}
  }

  public class ThreeInject {
    @javax.inject.Inject
    public ThreeInject() {}

    @javax.inject.Inject
    public ThreeInject(int m, int n) {}

    @jakarta.inject.Inject
    public ThreeInject(int m, int n, boolean x) {}
  }

  public class OneInject {
    @com.google.inject.Inject String x;

    @com.google.inject.Inject
    public OneInject() {}

    public OneInject(int n) {}
  }

  @SuppressWarnings("MoreThanOneInjectableConstructor")
  public class SuppressedTwo {
    @com.google.inject.Inject
    public SuppressedTwo() {}

    @com.google.inject.Inject
    public SuppressedTwo(int n) {}
  }

  @SuppressWarnings("inject-constructors")
  public class AltSuppressed {
    @com.google.inject.Inject
    public AltSuppressed() {}

    @com.google.inject.Inject
    public AltSuppressed(int n) {}
  }

  @SuppressWarnings("InjectMultipleAtInjectConstructors")
  public class AltSuppressed2 {
    @com.google.inject.Inject
    public AltSuppressed2() {}

    @com.google.inject.Inject
    public AltSuppressed2(int n) {}
  }

  @Qualifier
  @Retention(RUNTIME)
  public @interface Foo1 {}

  @Qualifier
  @Retention(RUNTIME)
  public @interface Foo2 {}

  @BindingAnnotation
  @Retention(RUNTIME)
  public @interface Bar1 {}

  @BindingAnnotation
  @Retention(RUNTIME)
  public @interface Bar2 {}

  @Foo1
  @Foo2
  public class DoubleQualified {
    @Foo1
    @Foo2
    private int n;

    @Foo1
    @Foo2
    public DoubleQualified() {}

    @Foo1
    @Foo2
    public void setN(
        @Foo1
            @Foo2
            int n) {}
  }

  @Bar1
  @Bar2
  public class DoubleBinding {
    @Bar1 @Bar2 private int n;

    public void setN(@Bar1 @Bar2 int n) {}
  }

  @Foo1
  @Bar1
  public class MixedQualified {
    @Foo1 @Bar1 private int n;

    @Foo1 @Singleton @Bar1 private int m;
  }

  @Foo1
  public class SingleQualified {
    @Foo1 private int n;

    @Foo1
    public SingleQualified() {}

    @Foo1
    public void setN(@Foo1 int n) {}

    @Singleton
    @Foo1
    public void setM(@Singleton @Foo1 int m) {}
  }

  @Bar1
  public class SingleBinding {
    @Bar1 private int n;
  }
}
