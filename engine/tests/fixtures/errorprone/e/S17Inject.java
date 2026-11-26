package e;

import com.google.inject.BindingAnnotation;
import com.google.inject.ScopeAnnotation;
import dagger.Component;
import dagger.Subcomponent;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import javax.inject.Inject;
import javax.inject.Scope;
import javax.inject.Singleton;

public class S17Inject {
  @Inject final int finalField = 1;
  @Inject int plainField;
  @Inject static final int STATIC_FINAL = 1;
  @Inject final int firstOfTwo = 1, secondOfTwo = 2;
  @Inject final String[] array = {};
  @javax.inject.Inject private final Object qualified = null;
  @com.google.inject.Inject final Object guiceInject = null;
  @jakarta.inject.Inject final Object jakartaInject = null;

  @SuppressWarnings("JavaxInjectOnFinalField")
  @Inject
  final int suppressed = 1;

  @Inject
  public void method(final int parameter) {
    @Inject final int local = 1;
  }

  interface Constants {
    @Inject int CONSTANT = 1;
  }

  record Component1(@Inject int value) {}

  enum Constant {
    @Inject FIRST
  }

  abstract static class Abstract {
    @javax.inject.Inject
    Abstract() {}

    @com.google.inject.Inject
    protected Abstract(int value) {}

    @jakarta.inject.Inject
    Abstract(String value) {}

    @Deprecated
    @javax.inject.Inject
    @com.google.inject.Inject
    Abstract(long value) {}

    Abstract(char value) {}

    @javax.inject.Inject
    void method() {}

    @SuppressWarnings("InjectOnConstructorOfAbstractClass")
    @javax.inject.Inject
    Abstract(byte value) {}

    class Inner {
      @javax.inject.Inject
      Inner() {}
    }

    abstract static class Nested {
      @javax.inject.Inject
      Nested() {}
    }
  }

  static class Concrete {
    @javax.inject.Inject
    Concrete() {}

    @SuppressWarnings("unused")
    @javax.inject.Inject
    Concrete(int value) {}

    abstract class Deeper {
      @javax.inject.Inject
      Deeper() {}
    }
  }

  @BindingAnnotation
  @Retention(RetentionPolicy.RUNTIME)
  @interface Binding {}

  @Retention(RetentionPolicy.RUNTIME)
  @interface Plain {}

  @BindingAnnotation
  @Retention(RetentionPolicy.RUNTIME)
  @interface Other {}

  static class Optional {
    @com.google.inject.Inject(optional = true)
    Optional() {}

    @com.google.inject.Inject(optional = false)
    Optional(int value) {}

    @com.google.inject.Inject
    @Binding
    Optional(long value) {}

    @Binding
    @com.google.inject.Inject(optional = true)
    @Plain
    @Other
    Optional(char value) {}

    @com.google.inject.Inject
    @Plain
    Optional(byte value) {}

    @Binding
    @javax.inject.Inject
    Optional(short value) {}

    @Binding
    Optional(float value) {}

    @com.google.inject.Inject
    @SuppressWarnings("InjectedConstructorAnnotations")
    @Binding
    Optional(double value) {}

    @com.google.inject.Inject
    @Binding
    void method() {}
  }

  @Singleton
  abstract static class AbstractScoped {}

  @com.google.inject.Singleton
  interface InterfaceScoped {}

  @Singleton
  static class ConcreteScoped {}

  @Scope
  @Retention(RetentionPolicy.RUNTIME)
  @interface CustomScope {}

  @CustomScope
  abstract static class CustomAbstract {}

  @CustomScope
  @Singleton
  interface Both {}

  @Singleton
  @interface ScopedAnnotation {}

  @Singleton
  enum ScopedEnum {
    ONE
  }

  @Singleton
  record ScopedRecord() {}

  @Component
  @Singleton
  interface ComponentInterface {
    @Subcomponent
    @CustomScope
    abstract class SubcomponentClass {}
  }

  @SuppressWarnings("InjectScopeAnnotationOnInterfaceOrAbstractClass")
  @Singleton
  interface SuppressedScope {}

  interface Methods {
    @Singleton
    void method();

    void parameter(@CustomScope int value);
  }

  @Target(ElementType.TYPE)
  @Scope
  @Retention(RetentionPolicy.RUNTIME)
  @interface TypeOnly {}

  @Target(ElementType.METHOD)
  @Scope
  @Retention(RetentionPolicy.RUNTIME)
  @interface MethodOnly {}

  @Target({ElementType.PARAMETER, ElementType.METHOD, ElementType.CONSTRUCTOR})
  @Scope
  @Retention(RetentionPolicy.RUNTIME)
  @interface Several {}

  @Target(value = {ElementType.PARAMETER, ElementType.METHOD, java.lang.annotation.ElementType.CONSTRUCTOR})
  @Scope
  @Retention(RetentionPolicy.RUNTIME)
  @interface Valued {}

  @Target({})
  @ScopeAnnotation
  @Retention(RetentionPolicy.RUNTIME)
  @interface Empty {}

  @Target(ElementType.FIELD)
  @jakarta.inject.Scope
  @Retention(RetentionPolicy.RUNTIME)
  @interface Jakarta {}

  @Target({ElementType.TYPE, ElementType.METHOD})
  @Scope
  @Retention(RetentionPolicy.RUNTIME)
  @interface Fine {}

  @Target({ElementType.METHOD, ElementType.TYPE, ElementType.FIELD, ElementType.TYPE_USE, ElementType.RECORD_COMPONENT})
  @Scope
  @Retention(RetentionPolicy.RUNTIME)
  @interface MoreThanNeeded {}

  @Target(ElementType.PARAMETER)
  @Retention(RetentionPolicy.RUNTIME)
  @interface NotScope {}

  @Scope
  @Retention(RetentionPolicy.RUNTIME)
  @interface NoTarget {}

  @SuppressWarnings("InjectInvalidTargetingOnScopingAnnotation")
  @Target(ElementType.TYPE)
  @Scope
  @Retention(RetentionPolicy.RUNTIME)
  @interface SuppressedTarget {}
}
