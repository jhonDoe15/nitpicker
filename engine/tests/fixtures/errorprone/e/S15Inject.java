package e;

import com.google.inject.Inject;
import dagger.MembersInjector;
import dagger.internal.Binding;
import dagger.internal.Factory;
import dagger.internal.Preconditions;
import javax.annotation.Generated;

class S15Inject {
  class Zero {
    public void foo() {}
  }

  class One extends Zero {
    @javax.inject.Inject
    public void foo() {}
  }

  class Two extends One {
    public void foo() {}
  }

  class Three extends Two {
    public void foo() {}

    public void bar() {}
  }

  class Four extends Three {
    @Inject
    public void foo() {}
  }

  class Five extends Four {
    public void foo() {}
  }

  class GuiceBase {
    @com.google.inject.Inject
    public void foo() {}
  }

  class JavaxMid extends GuiceBase {
    @javax.inject.Inject
    public void foo() {}
  }

  class Last extends JavaxMid {
    public void foo() {}
  }

  interface Contract {
    @javax.inject.Inject
    void act(String value);

    @javax.inject.Inject
    void act();
  }

  abstract class Implementor implements Contract {
    public void act(String value) {}

    @javax.inject.Inject
    public void act() {}

    @SuppressWarnings("OverridesJavaxInjectableMethod")
    public void foo() {}
  }

  class Jakarta {
    @jakarta.inject.Inject
    public void foo() {}
  }

  class JakartaChild extends Jakarta {
    public void foo() {}
  }

  static class Uses {
    Factory<String> factory;
    MembersInjector<String> injector;
    Binding<String> binding;

    void run() {
      factory.get();
      injector.injectMembers("a");
      binding.get();
      Preconditions.checkNotNull("a");
      new Plain().get();
    }
  }

  @SuppressWarnings("RefersToDaggerCodegen")
  static class Suppressed {
    Factory<String> factory;

    void run() {
      factory.get();
    }
  }

  @Generated("dagger.internal.codegen.ComponentProcessor")
  static class FromDagger {
    Factory<String> factory;

    void run() {
      factory.get();
      Preconditions.checkNotNull("a");
    }
  }

  @Generated("some.other.Processor")
  static class FromOther {
    Factory<String> factory;

    void run() {
      factory.get();
    }
  }

  @Generated(value = {"x.Y", "dagger.internal.codegen.ComponentProcessor"}, date = "today")
  static class FromList {
    Factory<String> factory;

    void run() {
      factory.get();
    }
  }

  @javax.annotation.processing.Generated("dagger.internal.codegen.ComponentProcessor")
  static class FromProcessing {
    Factory<String> factory;

    void run() {
      factory.get();
    }
  }

  static class Plain implements Factory<String> {
    public String get() {
      return null;
    }
  }

  static class Mid extends Plain {
    String call() {
      return get();
    }
  }

  static class Adapter$$ParentAdapter implements MembersInjector<String> {
    Factory<String> factory;

    public void injectMembers(String instance) {
      factory.get();
    }
  }

  static class Dagger1 extends Binding<String> {
    Factory<String> factory;

    void run() {
      factory.get();
    }
  }

  static class Outer {
    @Generated("dagger.internal.codegen.ComponentProcessor")
    static class Inside {
      Factory<String> factory;

      void run() {
        factory.get();
      }
    }
  }
}
