import com.google.common.annotations.VisibleForTesting;
import com.google.common.labs.base.Finalizer;
import com.google.inject.Provides;
import com.google.inject.multibindings.ProvidesIntoSet;
import java.lang.ref.Reference;
import java.util.Set;
import javax.annotation.processing.AbstractProcessor;
import javax.annotation.processing.Processor;
import javax.annotation.processing.RoundEnvironment;
import javax.inject.Inject;
import javax.lang.model.element.TypeElement;
import org.junit.Test;

class S20Framework {
  static class Visible {
    @Inject
    public Visible() {}

    @Inject
    protected Visible(int a) {}

    @Inject
    Visible(String a) {}

    @Inject
    public Visible(int a, int b) {}

    @Provides
    public int provides() {
      return 1;
    }

    @dagger.Provides
    protected static final int daggerProvides() {
      return 1;
    }

    @ProvidesIntoSet
    public int intoSet() {
      return 1;
    }

    @Inject
    @VisibleForTesting
    public void forTesting() {}

    @Inject
    @com.google.common.annotations.VisibleForTesting
    protected void forTesting2() {}

    public int plain() {
      return 1;
    }

    @Inject
    private void hidden() {}

    @Inject
    public void setX(int x) {}

    @Provides
    @ProvidesIntoSet
    public int both() {
      return 1;
    }

    @Inject
    public final void finals() {}

    @SuppressWarnings("UnnecessarilyVisible")
    @Inject
    public void suppressed() {}
  }

  static class Parent {
    public void foo() {}
  }

  static class Child extends Parent {
    @Provides
    public void foo() {}
  }

  interface Api {
    @Provides
    void iface();
  }

  static class Impl implements Api {
    @Provides
    public void iface() {}
  }

  static class Tests {
    @Test
    public void testFoo() {}

    @Test
    public void test() {}

    @Test
    public void testA() {}

    @Test
    public void test_underscore() {}

    @Test
    public void foo() {}

    public void testNotATest() {}

    @Test
    public void testBar(int x) {}

    @Test
    @SuppressWarnings("UnnecessaryTestMethodPrefix")
    public void testSuppressed() {}

    @Test
    public void tester() {}

    @Test
    public void testÉclair() {}

    void call() {
      testFoo();
      testBar(1);
    }
  }

  static class Tests2 {
    @Test
    public void testOnly() {}
  }

  abstract static class Claim implements Processor {
    @Override
    public boolean process(Set<? extends TypeElement> annotations, RoundEnvironment roundEnv) {
      return true;
    }
  }

  abstract static class ClaimFalse implements Processor {
    @Override
    public boolean process(Set<? extends TypeElement> annotations, RoundEnvironment roundEnv) {
      return false;
    }
  }

  abstract static class NotProcessor {
    public boolean process(Set<? extends TypeElement> annotations, RoundEnvironment roundEnv) {
      return true;
    }
  }

  abstract static class Unfixable implements Processor {
    abstract boolean helper();

    @Override
    public boolean process(Set<? extends TypeElement> annotations, RoundEnvironment roundEnv) {
      try {
        return helper();
      } catch (Throwable t) {
      }
      return false;
    }
  }

  static class Abstract extends AbstractProcessor {
    static final boolean YES = true;

    @Override
    public boolean process(Set<? extends TypeElement> annotations, RoundEnvironment roundEnv) {
      if (annotations.isEmpty()) {
        return YES;
      }
      Runnable r = () -> {};
      Object o =
          new Object() {
            boolean f() {
              return true;
            }
          };
      return !false;
    }

    public boolean process(Set<TypeElement> annotations, int x) {
      return true;
    }

    public boolean process(RoundEnvironment env) {
      return true;
    }
  }

  abstract static class Suppressed implements Processor {
    @SuppressWarnings("DoNotClaimAnnotations")
    @Override
    public boolean process(Set<? extends TypeElement> annotations, RoundEnvironment roundEnv) {
      return true;
    }
  }

  static class Game {
    private long nativeResourcePtr;
    private static long staticPtr;
    private int intPtr;
    private Long boxedPtr = 1L;
    private String text = "";

    private static native long doNativeInit();

    private static native void cleanUpNativeResources(long nativeResourcePtr);

    private static native void playAwesomeGame(long nativeResourcePtr);

    private static native void playWith(long ptr, Game instance);

    private static native void playText(String text);

    private static native void playNothing();

    private native void instanceNative(long ptr);

    private static void notNative(long ptr) {}

    Game() {
      nativeResourcePtr = doNativeInit();
      playAwesomeGame(nativeResourcePtr);
    }

    @SuppressWarnings("removal")
    @Override
    protected void finalize() throws Throwable {
      cleanUpNativeResources(nativeResourcePtr);
      nativeResourcePtr = 0;
      super.finalize();
    }

    public void run() {
      playAwesomeGame(nativeResourcePtr);
      playAwesomeGame(staticPtr);
      playAwesomeGame(intPtr);
      playAwesomeGame(boxedPtr);
      playAwesomeGame(this.nativeResourcePtr);
      playAwesomeGame(1);
      playAwesomeGame((nativeResourcePtr));
      playWith(nativeResourcePtr, this);
      playText(text);
      playNothing();
      instanceNative(nativeResourcePtr);
      notNative(nativeResourcePtr);
      long local = 5;
      playAwesomeGame(local);
      Runnable r = () -> playAwesomeGame(nativeResourcePtr);
      new Object() {
        void f() {
          playAwesomeGame(nativeResourcePtr);
        }
      };
    }

    public static void runStatic(Game game) {
      playAwesomeGame(game.nativeResourcePtr);
    }

    @SuppressWarnings("UnsafeFinalization")
    public void suppressed() {
      playAwesomeGame(nativeResourcePtr);
    }

    class Inner {
      void f() {
        playAwesomeGame(nativeResourcePtr);
      }
    }
  }

  static class NoFinalizer {
    private long ptr;

    private static native void play(long ptr);

    void run() {
      play(ptr);
    }
  }

  static class Fenced {
    private long ptr;

    private static native void play(long ptr);

    @SuppressWarnings("removal")
    @Override
    protected void finalize() {}

    void run() {
      try {
        play(ptr);
      } finally {
        Reference.reachabilityFence(this);
      }
    }
  }

  static class FinalizerField {
    private long ptr;
    private final Finalizer finalizer = new Finalizer();

    private static native void play(long ptr);

    void run() {
      play(ptr);
    }
  }

  static class SubGame extends Game {
    private static native void play(long ptr);

    public void run() {
      play(2);
    }
  }

  static class Sub2 extends Game {
    private static native void play(long ptr);

    public void run() {
      play(super.nativeResourcePtr);
    }
  }
}
