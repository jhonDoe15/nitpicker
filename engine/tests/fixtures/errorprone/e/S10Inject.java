package e;

import com.google.inject.Inject;
import com.google.inject.Provides;
import com.google.inject.Singleton;
import com.google.inject.assistedinject.Assisted;
import com.google.inject.assistedinject.AssistedInject;
import com.google.inject.servlet.RequestScoped;
import com.google.inject.servlet.SessionScoped;
import dagger.Component;
import dagger.Subcomponent;
import dagger.producers.ProductionComponent;
import dagger.producers.ProductionSubcomponent;
import java.util.List;
import javax.inject.Scope;

public class S10Inject {
  @Singleton
  public class Scoped1 {
    @Inject
    public Scoped1(String unassisted, @Assisted String assisted) {}
  }

  @RequestScoped
  public class Scoped2 {
    @Inject
    public Scoped2(String unassisted, @Assisted String assisted) {}
  }

  @Singleton
  public class Scoped3 {
    @AssistedInject
    public Scoped3(String param) {}
  }

  /** Multiple constructors, but only one with @Inject, and that one matches. */
  @Singleton
  public class Scoped4 {
    @Inject
    public Scoped4(String unassisted, @Assisted String assisted) {}

    public Scoped4(String unassisted, int i) {}

    public Scoped4(int i, String unassisted) {}
  }

  /** Multiple constructors, none with @Inject, one matches. */
  @Singleton
  public class Scoped5 {
    public Scoped5(String unassisted1, String unassisted2) {}

    public Scoped5(String unassisted, int i) {}

    @AssistedInject
    public Scoped5(int i, String unassisted) {}
  }

  /** JSR330 annotations. */
  @javax.inject.Singleton
  public class Scoped6 {
    @javax.inject.Inject
    public Scoped6(String unassisted, @Assisted String assisted) {}
  }

  @SessionScoped
  @Singleton
  public class Scoped7 {
    @AssistedInject
    public Scoped7(String param) {}
  }

  public class NotAssisted1 {
    public NotAssisted1(String unassisted1, String unassisted2) {}
  }

  @SuppressWarnings("foo")
  public class NotAssisted2 {
    public NotAssisted2(String unassisted, @Assisted String assisted) {}
  }

  @Singleton
  public class NotAssisted3 {
    public NotAssisted3(String unassisted1, String unassisted2) {}
  }

  public class NotAssisted4 {
    @Inject
    public NotAssisted4(@Assisted String assisted) {}
  }

  public class NotAssisted5 {
    @AssistedInject
    public NotAssisted5(String unassisted) {}
  }

  @Singleton
  public class NotAssisted6 {
    public NotAssisted6(@Assisted String assisted) {}
  }

  @Singleton
  public class NotAssisted7 {
    public NotAssisted7(String unassisted1, String unassisted2) {}

    public NotAssisted7(String unassisted, int i) {}

    public NotAssisted7(int i, String unassisted) {}
  }

  @Singleton
  public class NotAssisted8 {
    @Inject
    public NotAssisted8(String unassisted1, String unassisted2) {}

    @AssistedInject
    public NotAssisted8(String param, int i) {}

    @AssistedInject
    public NotAssisted8(int i, String param) {}
  }

  @Singleton
  public class NotAssisted9 {
    public NotAssisted9(@Assisted String assisted, String unassisted) {}

    public NotAssisted9(@Assisted String assisted, int i) {}

    public NotAssisted9(int i, @Assisted String assisted) {}
  }

  @Singleton
  @SuppressWarnings("GuiceAssistedInjectScoping")
  public class SuppressedScoped {
    @AssistedInject
    public SuppressedScoped(String param) {}
  }

  public class Params1 {
    @javax.inject.Inject
    public Params1(int n, @Assisted String x, @Assisted String y, int z) {}

    @javax.inject.Inject
    public Params1(
        @Assisted("foo") int a,
        @Assisted("foo") int b,
        @Assisted("baz") String x,
        @Assisted("baz") String z) {}
  }

  public class Params2 {
    @javax.inject.Inject
    public Params2(int n, @Assisted("foo") int x, @Assisted("foo") int y, String z) {}
  }

  public class Params3 {
    private static final String FOO = "foo";

    @javax.inject.Inject
    public Params3(int n, @Assisted("foo") List<String> x, @Assisted(FOO) List<String> y, String z) {}

    @javax.inject.Inject
    public Params3(@Assisted() int n, @Assisted("bar") int x, @Assisted("bar") int y, String z) {}
  }

  class GenericClass<T> {
    @javax.inject.Inject
    GenericClass(@Assisted T a, @Assisted T b) {}

    @javax.inject.Inject
    GenericClass(@Assisted Integer a, @Assisted int b) {}

    @AssistedInject
    GenericClass(@Assisted String a, @Assisted String b, @Assisted long c, @Assisted Long d) {}
  }

  public class ParamsOk1 {
    @javax.inject.Inject
    public ParamsOk1(@Assisted int x, @Assisted String y, long z) {}
  }

  public class ParamsOk2 {
    @javax.inject.Inject
    public ParamsOk2(@Assisted("foo") int x, @Assisted("bar") int y, String z) {}
  }

  public class ParamsOk3 {
    @javax.inject.Inject
    public ParamsOk3(@Assisted int x, int y, String z) {}
  }

  public class ParamsOk4 {
    @javax.inject.Inject
    public ParamsOk4(@Assisted("foo") int x, int y, String z) {}
  }

  public class ParamsOk5 {
    @javax.inject.Inject
    public ParamsOk5(@Assisted("foo") List<String> x, @Assisted("foo") List<Integer> y, String z) {}
  }

  public class ParamsNoInject {
    public ParamsNoInject(@Assisted String x, @Assisted String y) {}
  }

  public class ParamsSuppressed {
    @SuppressWarnings("GuiceAssistedParameters")
    @javax.inject.Inject
    public ParamsSuppressed(@Assisted String x, @Assisted String y) {}
  }

  public class FinalFields {
    @Inject final int a = 0;

    @Inject
    public final int b = 0;

    @Inject @javax.annotation.Nullable
    final Object c = null;

    @Inject public int notFinal;

    public final int notInjected = 0;

    @javax.inject.Inject final int javaxInjected = 0;

    @Inject
    final void method() {}

    @Inject
    @SuppressWarnings("GuiceInjectOnFinalField")
    final int suppressed = 0;

    @Inject static final int staticFinal = 0;

    @Inject private final transient int mixed = 0;
  }

  @Singleton
  @SessionScoped
  class TwoScopes {}

  @Singleton
  @SuppressWarnings("foo")
  @SessionScoped
  class TwoScopesBetween {}

  @Scope
  @interface CustomScope {}

  @Singleton
  @CustomScope
  @SessionScoped
  class ThreeScopes {}

  class NoAnnotation {}

  @SuppressWarnings("foo")
  class NoScope {}

  @Singleton
  class OneScope {}

  @Singleton
  @SuppressWarnings("foo")
  class OneScopeAndOther {}

  @SuppressWarnings("foo")
  class MethodScope {
    @Singleton
    @Provides
    public void foo() {}
  }

  @Singleton
  @SessionScoped
  @Component
  class DaggerComponent {}

  @Singleton
  @SessionScoped
  @Subcomponent
  class DaggerSubcomponent {}

  @Singleton
  @SessionScoped
  @ProductionComponent
  class DaggerProductionComponent {}

  @Singleton
  @SessionScoped
  @ProductionSubcomponent
  class DaggerProductionSubcomponent {}

  @Singleton
  @SessionScoped
  @SuppressWarnings("MoreThanOneScopeAnnotationOnClass")
  class AltNameSuppression {}

  @Singleton
  @SessionScoped
  @SuppressWarnings("InjectMoreThanOneScopeAnnotationOnClass")
  class NameSuppression {}

  @Singleton
  @javax.inject.Singleton
  class GuiceAndJavaxScope {}

  @Singleton
  @Singleton2
  class RepeatedDifferent {}

  @interface Singleton2 {}
}
