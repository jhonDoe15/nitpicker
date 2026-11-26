package e;

import com.google.inject.AbstractModule;
import com.google.inject.Binder;
import com.google.inject.Module;
import com.google.inject.Provides;

class S12Inject {
  @javax.inject.Scope
  @javax.inject.Qualifier
  @interface JavaxScopeAndJavaxQualifier {}

  @com.google.inject.ScopeAnnotation
  @javax.inject.Qualifier
  @interface GuiceScopeAndJavaxQualifier {}

  @com.google.inject.ScopeAnnotation
  @com.google.inject.BindingAnnotation
  @interface GuiceScopeAndGuiceBindingAnnotation {}

  @javax.inject.Scope
  @com.google.inject.BindingAnnotation
  public @interface JavaxScopeAndGuiceBindingAnnotation {}

  @javax.inject.Scope
  @interface MyJavaxScope {}

  @com.google.inject.ScopeAnnotation
  @interface MyGuiceScope {}

  @javax.inject.Qualifier
  @interface MyJavaxQualifier {}

  @com.google.inject.BindingAnnotation
  @interface MyGuiceBindingAnnotation {}

  @interface Plain {}

  @SuppressWarnings("OverlappingQualifierAndScopeAnnotation")
  @javax.inject.Scope
  @javax.inject.Qualifier
  @interface SuppressedOverlap {}

  @javax.inject.Scope @javax.inject.Qualifier @interface OneLine {}

  @javax.inject.Scope
  @javax.inject.Qualifier
  @Plain
  @interface WithPlain {}

  public class TestClass1 {
    @Provides
    void providesBlah() {}
  }

  public class TestModule extends AbstractModule {
    @Override
    protected void configure() {
      Object x =
          new Object() {
            @Provides
            void providesBlah() {}
          };
    }

    @Provides
    int fine() {
      return 1;
    }
  }

  public class TestClass2 {
    class NestedModule extends AbstractModule {
      @Override
      protected void configure() {}

      @Provides
      int thisIsOk() {
        return 42;
      }
    }

    @Provides
    int thisIsNotOk() {
      return 42;
    }

    @Provides int sameLine() { return 1; }

    @SuppressWarnings("ProvidesMethodOutsideOfModule")
    @Provides
    int suppressed() {
      return 1;
    }
  }

  class Module1 extends AbstractModule {
    @Override
    protected void configure() {}

    @Provides
    int providesFoo() {
      return 42;
    }
  }

  class Module2 implements Module {
    @Override
    public void configure(Binder binder) {}

    @Provides
    int providesFoo() {
      return 42;
    }
  }

  interface Registry {
    @Provides
    int viaInterface();

    @dagger.Provides
    int viaDagger();
  }
}
