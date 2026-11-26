package e;

import com.google.inject.BindingAnnotation;
import dagger.Module;
import dagger.Provides;
import java.lang.annotation.ElementType;
import java.lang.annotation.Target;
import javax.inject.Inject;
import javax.inject.Named;
import javax.inject.Qualifier;
import javax.inject.Singleton;

class S19Inject {
  static class Method {
    @Inject
    @Named("bar")
    void someMethod() {}
  }

  static class MethodScope {
    @Inject
    @Singleton
    @Named("bar")
    void someMethod() {}
  }

  static class MethodNamedFirst {
    @Named("bar")
    @Singleton
    @Inject
    void someMethod() {}
  }

  @Singleton
  static class Constructor {
    @Inject
    @Singleton
    @Named("bar")
    Constructor() {}
  }

  static class ConstructorNoModifiers {
    @Inject
    @Singleton
    @Named("bar")
    ConstructorNoModifiers(int x) {}
  }

  public static class ConstructorPublic {
    @Inject
    @Named("bar")
    public ConstructorPublic(String x) {}
  }

  @Module
  static class Provider {
    @Provides
    @Named("bar")
    int something() {
      return 42;
    }

    @Inject
    @Provides
    @Named("bar")
    int somethingElse() {
      return 42;
    }

    @Inject
    @Provides
    @Singleton
    @Named("baz")
    int somethingThird() {
      return 42;
    }
  }

  static class Negative {
    @Inject
    void noQualifier() {}

    @Named("x")
    void noInject() {}

    @Singleton
    void scopeOnly() {}
  }

  static class Suppressed {
    @SuppressWarnings("QualifierOrScopeOnInjectMethod")
    @Inject
    @Named("bar")
    void someMethod() {}
  }

  record Rec(int x) {
    @Inject
    @Singleton
    Rec {}
  }

  @Qualifier
  @Target({ElementType.TYPE_USE, ElementType.CONSTRUCTOR})
  @interface Qualifier1 {}

  @Qualifier
  @Target({ElementType.TYPE_USE, ElementType.TYPE_PARAMETER})
  @interface Qualifier2 {}

  @BindingAnnotation
  @Target({ElementType.FIELD, ElementType.TYPE_USE})
  @interface BindingAnnotation1 {}

  @BindingAnnotation
  @Target({ElementType.TYPE_USE, ElementType.TYPE_PARAMETER})
  @interface BindingAnnotation2 {}

  @BindingAnnotation
  @Target(ElementType.TYPE_USE)
  @interface BindingAnnotation3 {}

  @Qualifier
  @Target({ElementType.TYPE_PARAMETER, ElementType.METHOD, ElementType.FIELD, ElementType.TYPE_USE, ElementType.PARAMETER})
  @interface Qualifier3 {}

  @Qualifier
  @Target(value = {ElementType.TYPE_USE, ElementType.METHOD})
  @interface Qualifier4 {}

  @Qualifier
  @Target({ElementType.CONSTRUCTOR})
  @interface Negative1 {}

  @Target({ElementType.TYPE_USE, ElementType.TYPE_PARAMETER})
  @interface NotAQualifier {}

  @Qualifier
  @interface NoTarget {}

  @SuppressWarnings("QualifierWithTypeUse")
  @Qualifier
  @Target(ElementType.TYPE_USE)
  @interface SuppressedQualifier {}

  @Qualifier
  @Target(java.lang.annotation.ElementType.TYPE_USE)
  @interface Qualified {}
}
