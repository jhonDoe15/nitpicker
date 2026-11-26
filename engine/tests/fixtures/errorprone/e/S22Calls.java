import com.google.common.base.Throwables;
import com.google.common.collect.ImmutableList;
import com.google.inject.AbstractModule;
import com.google.inject.Guice;
import com.google.inject.Module;
import com.google.inject.util.Modules;
import java.util.Objects;
import javax.annotation.processing.ProcessingEnvironment;
import javax.lang.model.type.TypeMirror;
import javax.lang.model.util.Types;
import junit.framework.TestCase;

class S22Calls {
  static class ThreeTest extends TestCase {
    public void testOne() {}

    void testHidden() {}

    public void testWithArgument(int x) {}

    public int testReturns() {
      return 1;
    }

    public void helper() {}

    void calls() {
      testOne();
      this.testOne();
      testHidden();
      helper();
      testReturns();
    }
  }

  static class Four {
    @org.junit.Test
    public void four() {}

    @org.junit.Ignore
    void ignored() {}

    @org.junit.jupiter.api.Test
    void five() {}

    @org.junit.jupiter.api.Disabled
    void six() {}

    void plain() {}

    void calls(ThreeTest t) {
      four();
      ignored();
      five();
      six();
      plain();
      t.testOne();
      new Four().four();
      Runnable r = this::four;
    }

    @SuppressWarnings("JUnitMethodInvoked")
    void suppressed() {
      four();
    }
  }

  void unchecked(RuntimeException runtime, Error error, Exception exception, Throwable throwable, IllegalStateException state) {
    Throwables.throwIfUnchecked(runtime);
    Throwables.throwIfUnchecked(error);
    Throwables.throwIfUnchecked(exception);
    Throwables.throwIfUnchecked(throwable);
    Throwables.propagateIfPossible(state);
    Throwables.propagateIfPossible(throwable);
  }

  void block(RuntimeException e) {
    if (e != null) {
      Throwables.throwIfUnchecked(e);
      System.out.println("unreachable");
      int x = 1;
    }
    Throwables.throwIfUnchecked(e);
  }

  void io() throws java.io.IOException {}

  void caught() {
    try {
      System.out.println();
    } catch (RuntimeException | Error e) {
      Throwables.throwIfUnchecked(e);
      System.out.println();
    }
    try {
      System.out.println();
    } catch (IllegalStateException | IllegalArgumentException e) {
      Throwables.throwIfUnchecked(e);
    }
    try {
      io();
    } catch (RuntimeException | java.io.IOException e) {
      Throwables.throwIfUnchecked(e);
    }
    try {
      System.out.println();
    } catch (Throwable e) {
      Throwables.throwIfUnchecked(e);
    }
  }

  <T extends RuntimeException> void generic(T value) {
    Throwables.throwIfUnchecked(value);
  }

  @SuppressWarnings("ThrowIfUncheckedKnownUnchecked")
  void suppressedUnchecked(RuntimeException e) {
    Throwables.throwIfUnchecked(e);
  }

  static class ModuleA extends AbstractModule {}

  static class ModuleB extends AbstractModule {}

  static class ModuleC extends AbstractModule {}

  void foo(Module... xs) {}

  void both(Module a, Module... b) {}

  void notVarargs(Module a, Module b) {}

  void combine(Module[] ms) {
    Guice.createInjector(new ModuleA(), Modules.combine(new ModuleB(), new ModuleC()));
    foo(new ModuleA(), Modules.combine(new ModuleB(), new ModuleC()));
    foo(new ModuleA(), Modules.combine(new ModuleA()));
    foo(new ModuleA(), Modules.combine());
    foo(new ModuleA(), Modules.combine(ImmutableList.of(new ModuleA())));
    foo(Modules.combine(ms));
    notVarargs(new ModuleA(), Modules.combine(new ModuleB(), new ModuleC()));
    both(new ModuleA(), Modules.combine(new ModuleB(), new ModuleC()), Modules.combine(new ModuleB(), new ModuleC()));
    both(Modules.combine(new ModuleB(), new ModuleC()), new ModuleA());
    Module extra = Modules.combine(new ModuleA(), new ModuleB(), new ModuleC());
    Modules.combine(new ModuleA(), new ModuleB()).configure(null);
    foo(Modules.combine(null, new ModuleC()));
  }

  void mirrors(TypeMirror one, TypeMirror two, Types types, Object other) {
    if (one == two) {}
    if (one != two) {}
    if (one.equals(two)) {}
    if (Objects.equals(one, two)) {}
    if (one == null) {}
    if (null == one) {}
    if ((null) == one) {}
    if (one.equals(null)) {}
    if (Objects.equals(one, null)) {}
    if (Objects.equals(null, one)) {}
    if (one == other) {}
    if (other.equals(one)) {}
    if (types.isSameType(one, two)) {}
  }

  void noTypes(TypeMirror one, TypeMirror two, ProcessingEnvironment environment) {
    if (one == two) {}
    if (one != two) {}
  }

  static class Holder {
    ProcessingEnvironment environment;
    Types utilities;

    void fields(TypeMirror one, TypeMirror two) {
      if (one == two) {}
      if (!one.equals(two)) {}
    }
  }

  static class FieldsOnly {
    Types utilities;

    boolean fields(TypeMirror one, TypeMirror two) {
      return one != two;
    }
  }

  @SuppressWarnings("TypeEquals")
  boolean suppressedMirrors(TypeMirror one, TypeMirror two) {
    return one == two;
  }
}
