package e;

import dagger.Binds;
import dagger.Module;
import dagger.Provides;
import dagger.multibindings.Multibinds;
import dagger.producers.ProducerModule;
import javax.inject.Scope;
import javax.inject.Singleton;

class S23Dagger {
  @Scope
  @interface MyScope {}

  @interface NotAScope {}

  @Singleton
  @Module
  static class ScopedPositive {}

  @Module
  @Singleton
  @MyScope
  interface ScopedInterface {}

  @NotAScope
  @Module
  static class ScopedNegative {}

  @Singleton
  static class NotAModule {}

  @Singleton
  @ProducerModule
  abstract static class ScopedProducer {}

  @Module
  static class StaticMembers {
    @Provides
    static String provide() {
      return "";
    }

    static int FIELD = 1;
  }

  @Module
  abstract static class BindsMembers {
    @Binds
    abstract Runnable bind(Thread thread);

    int instance;
  }

  @Module
  abstract static class MultibindsMember {
    @Multibinds
    abstract java.util.Set<String> strings();
  }

  @Module
  static class InstanceProvides {
    @Provides
    String provide() {
      return "";
    }
  }

  @Module
  static class WithConstructor {
    WithConstructor() {}

    @Provides
    static String provide() {
      return "";
    }
  }

  @Module
  static class EmptyModule {}

  @Module
  interface InterfaceModule {
    @Provides
    static String provide() {
      return "";
    }
  }

  @ProducerModule
  static class ProducerStatic {
    static void helper() {}
  }

  @Module
  static class NestedStatic {
    static class Inner {}

    static enum Kind {
      A
    }
  }

  @Module
  static class NestedInstance {
    class Inner {}

    static int x;
  }

  @Module
  enum EnumModule {
    INSTANCE;

    @Provides
    static String provide() {
      return "";
    }
  }

  @SuppressWarnings("PrivateConstructorForNoninstantiableModule")
  @Module
  static class SuppressedPrivate {
    @Provides
    static String provide() {
      return "";
    }
  }

  @SuppressWarnings("ScopeOnModule")
  @Singleton
  @Module
  static class SuppressedScope {}
}
