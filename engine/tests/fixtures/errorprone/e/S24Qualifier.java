package e;

import com.google.auto.factory.AutoFactory;
import com.google.inject.Provides;
import com.google.inject.assistedinject.Assisted;
import dagger.BindsInstance;
import dagger.Component;
import dagger.Subcomponent;
import java.util.function.Function;
import javax.inject.Inject;
import javax.inject.Named;
import org.jukito.All;
import org.jukito.JukitoRunner;
import org.junit.Test;
import org.junit.runner.RunWith;

class S24Qualifier {
  @S24Qual int x;

  @S24Qual @S24Binding int two;

  @S24Qual int a, b;

  @Named("x") String named;

  @S24Plain int plain;

  @Inject @S24Qual int injected;

  @InjectMe @S24Qual int prefixed;

  @BindMe @S24Qual int bound;

  @Assisted int assisted;

  @SuppressWarnings("UnnecessaryQualifier")
  @S24Qual int suppressed;

  void locals() {
    @S24Qual int local = 1;
    @S24Qual @S24Binding int two = 2;
    try {
    } catch (@S24Qual RuntimeException e) {
    }
    for (@S24Qual String s : new String[0]) {}
    try (@S24Qual AutoCloseable c = null) {
    } catch (Exception e) {
    }
  }

  void parameter(@S24Qual int x) {}

  void parameters(@S24Qual int x, @S24Binding int y, @Assisted int z, @S24Plain int p) {}

  S24Qualifier(@S24Qual int x) {}

  @S24Qual
  int notProvider() {
    return 1;
  }

  @Provides
  @S24Qual
  int provider() {
    return 1;
  }

  @dagger.Provides
  @S24Qual
  int daggerProvider() {
    return 1;
  }

  @S24ProvidesSomething
  @S24Qual
  int customProvides() {
    return 1;
  }

  @Inject
  void injectMethod(@S24Qual int x) {}

  @Inject
  @S24Qual
  void injectedReturn() {}

  @AutoFactory
  void autoFactory(@S24Qual int x) {}

  @SuppressWarnings("UnnecessaryQualifier")
  void suppressedParam(@S24Qual int x) {}

  @dagger.Provides
  void providesParam(@S24Qual int x) {}

  @ProvidesMore
  void providesPrefix(@S24Qual int x) {}

  Function<Integer, Integer> lambda = (@S24Qual Integer a) -> a;

  @interface ProvidesMore {}

  @interface InjectMe {}

  @interface BindMe {}

  @Component.Builder
  interface Builder {
    Builder setName(@S24Qual String name);

    @S24Qual
    String build();
  }

  @Subcomponent.Factory
  interface Factory {
    Object create(@BindsInstance @S24Qual boolean isEnabled);
  }

  @Component
  abstract static class AbstractComponent {
    abstract Object create(@S24Qual int x);

    @S24Qual
    abstract Object other();
  }

  interface Api {
    @S24Qual
    Object frobnicator();

    void parameter(@S24Qual int x);
  }

  @interface Annotation {
    @S24Qual
    int value();
  }

  enum Kind {
    @S24Qual FIRST,
    SECOND
  }

  Object anonymous =
      new Object() {
        @S24Qual int field;

        @S24Qual
        int method() {
          return 1;
        }

        void parameter(@S24Qual int x) {}
      };

  record WithInject(@S24Qual int x) {
    @Inject
    WithInject {}
  }

  record WithoutInject(@S24Qual int x) {
    WithoutInject {}
  }

  record Implicit(@S24Qual int x, @S24Binding String y) {}

  record Explicit(@S24Qual int x) {
    @Inject
    Explicit(int x) {
      this.x = x;
    }
  }

  record ExplicitPlain(@S24Qual int x) {
    ExplicitPlain(int x) {
      this.x = x;
    }
  }

  record OtherCtor(@S24Qual int x) {
    @Inject
    OtherCtor(String s) {
      this(1);
    }
  }

  record Prefixed(@InjectMe @S24Qual int x) {}

  record WithAutoFactory(@S24Qual int x) {
    @AutoFactory
    WithAutoFactory {}
  }

  record WithMethod(@S24Qual int x) {
    @S24Qual
    int other() {
      return 1;
    }

    void param(@S24Qual int y) {}
  }

  @RunWith(JukitoRunner.class)
  static class JukitoTest {
    @Test
    void test(@All int x) {}

    void other(@All int x) {}

    @Test
    void qual(@S24Qual int x) {}
  }

  static class NoRunner {
    @Test
    void test(@All int x) {}
  }

  abstract static class Sub extends JukitoRunner {}

  @RunWith(Sub.class)
  static class SubRunnerTest {
    @Test
    void test(@All int x) {}
  }

  @AutoFactory
  static class AutoFactoryClass {
    void method(@S24Qual int x) {}

    @S24Qual
    int ret() {
      return 1;
    }
  }
}
