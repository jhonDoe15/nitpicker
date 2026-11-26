package e;

import com.google.errorprone.annotations.DoNotCall;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.sql.Time;
import java.util.SortedMap;
import java.util.SortedSet;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.locks.ReentrantReadWriteLock;

class B6DoNot {
  static class Base {
    @DoNotCall
    void plain() {}

    @DoNotCall("use other instead")
    public void withReason(int x, String y) {}

    @DoNotCall
    private void hidden() {}

    @DoNotCall
    final void finalOk() {}

    @DoNotCall
    static void staticOk() {}

    @DoNotCall
    protected synchronized void mods() {}

    @DoNotCall
    public static final void both() {}

    @DoNotCall
    @Deprecated
    void annotated() {}

    @DoNotCall
    <T> T generic(T t, java.util.List<? extends T> list) {
      return t;
    }
  }

  static final class FinalClass {
    @DoNotCall
    void inFinal() {}
  }

  static abstract class Abstract {
    @DoNotCall
    abstract void abs();

    @DoNotCall
    void concrete() {}
  }

  interface Iface {
    @DoNotCall
    void viaInterface();

    @DoNotCall
    default void defaulted() {}

    @DoNotCall
    static void staticIface() {}
  }

  enum Enum {
    A;

    @DoNotCall
    void inEnum() {}
  }

  static class Sub extends Base {
    @Override
    void plain() {}

    @Override
    public void withReason(int x, String y) {}

    @Override
    @DoNotCall
    final void annotated() {}
  }

  static class Sub2 extends Sub {
    @Override
    void plain() {}
  }

  static class Impl implements Iface {
    @Override
    public void viaInterface() {}

    @Override
    public void defaulted() {}
  }

  static class Impl2 implements Iface {
    @Override
    @DoNotCall
    public final void viaInterface() {}
  }

  @SuppressWarnings("DoNotCall")
  static class SuppressedSub extends Base {
    @Override
    void plain() {}
  }

  void calls(Base base, Sub sub, Iface iface, Enum e, FinalClass f, Abstract a, Impl impl) {
    base.plain();
    base.withReason(1, "a");
    sub.plain();
    sub.withReason(2, "b");
    sub.annotated();
    base.finalOk();
    Base.staticOk();
    base.mods();
    Base.both();
    new Base();
    iface.viaInterface();
    iface.defaulted();
    Iface.staticIface();
    e.inEnum();
    f.inFinal();
    a.abs();
    a.concrete();
    impl.viaInterface();
    base.generic("a", null);
    Runnable r = base::plain;
    java.util.function.Consumer<Base> c = Base::plain;
  }

  void viaAssigned() {
    final Base b = new Sub();
    b.plain();
    Base c = new Sub();
    c.plain();
    Base d = new Sub();
    d = new Sub();
    d.plain();
    Base e = new Base();
    e.plain();
  }

  void thirdParty() throws Exception {
    java.sql.Date date = new java.sql.Date(0);
    date.getHours();
    date.setMinutes(1);
    date.getSeconds();
    date.toInstant();
    date.getYear();
    Time time = new Time(0);
    time.getYear();
    time.setDate(1);
    time.toInstant();
    time.getHours();
    SortedMap<String, String> sm = new TreeMap<>();
    sm.putFirst("a", "b");
    sm.putLast("a", "b");
    TreeMap<String, String> tm = new TreeMap<>();
    tm.putFirst("a", "b");
    SortedSet<String> ss = new TreeSet<>();
    ss.addFirst("a");
    ss.addLast("a");
    TreeSet<String> ts = new TreeSet<>();
    ts.addLast("b");
    ThreadLocalRandom.current().setSeed(1L);
    new ReentrantReadWriteLock().readLock().newCondition();
    new ReentrantReadWriteLock().writeLock().newCondition();
    StackTraceElement ste = new Throwable().getStackTrace()[0];
    ste.getClass();
    StackWalker.getInstance().getClass();
    Method m = Object.class.getMethod("toString");
    m.getClass();
    Field fl = null;
    fl.getClass();
    java.lang.reflect.Constructor<?> ctor = Object.class.getConstructor();
    ctor.getClass();
    java.lang.reflect.ParameterizedType pt = null;
    pt.getClass();
    Object o = m;
    o.getClass();
    Thread t = new Thread();
    t.run();
    t.start();
    new Thread() {
      @Override
      public void run() {
        super.run();
        this.run();
      }
    };
    Runnable rr = t::run;
    java.lang.management.LockInfo li = null;
    li.getClass();
    java.lang.management.MonitorInfo mi = null;
    mi.getClass();
  }

  static class MyThread extends Thread {
    @Override
    public void run() {
      super.run();
    }

    void other() {
      run();
      this.run();
      super.run();
      start();
    }
  }
}
