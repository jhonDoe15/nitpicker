package e;

import java.io.IOException;
import java.io.InputStream;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.Condition;
import java.util.concurrent.locks.Lock;
import java.util.concurrent.locks.ReentrantLock;
import java.text.DateFormat;
import java.text.SimpleDateFormat;

class B6Threads {
  private final ThreadLocal<Object> perInstance = new ThreadLocal<>();
  private final ThreadLocal<String> wellKnownString = new ThreadLocal<String>();
  private final ThreadLocal<Integer> wellKnownInt = ThreadLocal.withInitial(() -> 1);
  private final ThreadLocal<Long> wellKnownLong = new ThreadLocal<Long>();
  private final ThreadLocal<SimpleDateFormat> formats = new ThreadLocal<SimpleDateFormat>();
  private final ThreadLocal<DateFormat> formats2 = new ThreadLocal<DateFormat>();
  private static final ThreadLocal<Object> STATIC = new ThreadLocal<>();
  private ThreadLocal<StringBuilder> builder = new ThreadLocal<StringBuilder>() {
    @Override
    protected StringBuilder initialValue() {
      return new StringBuilder();
    }
  };
  private ThreadLocal<Object> rawLocal = new ThreadLocal();
  private ThreadLocal<java.util.List<String>> listLocal;

  static class MyLocal<T> extends ThreadLocal<T> {}

  private MyLocal<Object> mine = new MyLocal<>();
  private MyLocal<String> mineString = new MyLocal<>();

  void local() {
    ThreadLocal<Object> insideMethod = new ThreadLocal<>();
    Object o = new ThreadLocal<Object>();
    listLocal = new ThreadLocal<>();
  }

  @SuppressWarnings("ThreadLocalUsage")
  private ThreadLocal<Object> suppressed = new ThreadLocal<>();

  static class Holder {
    ThreadLocal<Object> nested = new ThreadLocal<>();
    static ThreadLocal<Object> nestedStatic = new ThreadLocal<>();
  }

  @interface Singleton {}

  @Singleton
  static class Single {
    ThreadLocal<Object> single = new ThreadLocal<>();
  }

  void priorities() throws InterruptedException {
    Thread t = new Thread();
    t.setPriority(3);
    Thread.yield();
    Thread.currentThread().setPriority(Thread.MAX_PRIORITY);
    Thread.sleep(1);
    t.setName("x");
    new Thread() {
      void f() {
        setPriority(1);
        this.setPriority(2);
      }
    };
    Thread.ofPlatform().priority(3);
    Thread.ofPlatform().name("x").priority(3).start(() -> {});
    Thread.ofVirtual().name("v");
  }

  static class MyThread extends Thread {
    void f() {
      setPriority(4);
      super.setPriority(5);
    }
  }

  private final Object monitor = new Object();
  private final Lock lock = new ReentrantLock();
  private final Condition condition = lock.newCondition();
  boolean ready;

  void waitWithoutLoop() throws InterruptedException {
    synchronized (monitor) {
      monitor.wait();
    }
    synchronized (monitor) {
      monitor.wait(100);
    }
    synchronized (monitor) {
      monitor.wait(100, 5);
    }
    synchronized (monitor) {
      if (!ready) {
        monitor.wait();
      }
    }
    synchronized (monitor) {
      if (!ready) {
        monitor.wait(10);
      }
    }
    synchronized (monitor) {
      if (!ready) {
        monitor.wait();
      } else {
        ready = false;
      }
    }
    synchronized (monitor) {
      if (!ready)
        monitor.wait();
    }
    wait();
    this.wait();
  }

  void waitInLoop() throws InterruptedException {
    synchronized (monitor) {
      while (!ready) {
        monitor.wait();
      }
      for (;;) {
        monitor.wait();
      }
    }
  }

  void waitInDo() throws InterruptedException {
    synchronized (monitor) {
      do {
        monitor.wait();
      } while (!ready);
    }
  }

  void waitInForEach(java.util.List<String> list) throws InterruptedException {
    for (String s : list) {
      monitor.wait();
    }
  }

  void waitInLambdaInLoop() {
    while (Thread.interrupted()) {
      Runnable r = () -> {
        try {
          monitor.wait();
        } catch (InterruptedException e) {
        }
      };
    }
  }

  void waitInLoopInLambda() {
    Runnable r = () -> {
      try {
        monitor.wait();
      } catch (InterruptedException e) {
      }
    };
  }

  void waitInAnonymousInLoop() {
    while (true) {
      new Object() {
        void f() throws InterruptedException {
          monitor.wait();
        }
      };
    }
  }

  void conditions() throws InterruptedException {
    lock.lock();
    try {
      condition.await();
      condition.await(1, TimeUnit.SECONDS);
      condition.awaitNanos(5);
      condition.awaitUninterruptibly();
      condition.awaitUntil(new java.util.Date());
      if (!ready) {
        condition.await();
      }
      if (!ready) {
        condition.await(1, TimeUnit.SECONDS);
      }
      if (!ready) {
        condition.awaitUninterruptibly();
      } else {
        ready = true;
      }
      while (!ready) {
        condition.await();
      }
    } finally {
      lock.unlock();
    }
  }

  void notWait() throws InterruptedException {
    monitor.notify();
    monitor.notifyAll();
    Thread.currentThread().join();
  }

  private volatile Object volatileField;
  private Object plain;
  private String str;
  private int count;
  private long total;
  private Integer boxed;
  private java.util.List<String> list;
  private static Object staticPlain;

  Object dcl() {
    if (plain == null) {
      synchronized (this) {
        if (plain == null) {
          plain = new Object();
        }
      }
    }
    return plain;
  }

  Object dclVolatile() {
    if (volatileField == null) {
      synchronized (this) {
        if (volatileField == null) {
          volatileField = new Object();
        }
      }
    }
    return volatileField;
  }

  String dclString() {
    if (str == null) {
      synchronized (this) {
        if (str == null) {
          str = "x";
        }
      }
    }
    return str;
  }

  Integer dclBoxed() {
    if (boxed == null) {
      synchronized (this) {
        if (boxed == null) {
          boxed = 1;
        }
      }
    }
    return boxed;
  }

  java.util.List<String> dclReversed() {
    if (null == list) {
      synchronized (this) {
        if (list == null) {
          list = new java.util.ArrayList<>();
        }
      }
    }
    return list;
  }

  java.util.List<String> dclParens() {
    if ((list == null)) {
      synchronized (this) {
        // comment
        int a = 1;
        if ((list == null)) {
          list = new java.util.ArrayList<>();
        }
      }
    }
    return list;
  }

  java.util.List<String> dclNotEqual() {
    if (list != null) {
      synchronized (this) {
        if (list != null) {
          list.clear();
        }
      }
    }
    return list;
  }

  Object dclStatic() {
    if (staticPlain == null) {
      synchronized (B6Threads.class) {
        if (staticPlain == null) {
          staticPlain = new Object();
        }
      }
    }
    return staticPlain;
  }

  Object dclLocal() {
    Object local = plain;
    if (local == null) {
      synchronized (this) {
        local = plain;
        if (local == null) {
          plain = local = new Object();
        }
      }
    }
    return local;
  }

  Object dclLocalOk() {
    Object local = volatileField;
    if (local == null) {
      synchronized (this) {
        local = volatileField;
        if (local == null) {
          volatileField = local = new Object();
        }
      }
    }
    return local;
  }

  Object dclLocalNoAssign() {
    Object local = new Object();
    if (local == null) {
      synchronized (this) {
        if (local == null) {
          local = new Object();
        }
      }
    }
    return local;
  }

  Object dclLocalAfter() {
    Object local = null;
    if (local == null) {
      synchronized (this) {
        if (local == null) {
          local = plain;
        }
      }
    }
    return local;
  }

  Object dclDifferent(Object other) {
    if (plain == null) {
      synchronized (this) {
        if (other == null) {
          plain = new Object();
        }
      }
    }
    return plain;
  }

  Object dclOtherClassField(B6Threads that) {
    if (that.plain == null) {
      synchronized (this) {
        if (that.plain == null) {
          that.plain = new Object();
        }
      }
    }
    return plain;
  }

  Object dclNested() {
    if (plain == null) {
      {
        synchronized (this) {
          { if (plain == null) {
            plain = new Object();
          } }
        }
      }
    }
    return plain;
  }

  Object dclCount() {
    if (count == 0) {
      synchronized (this) {
        if (count == 0) {
          count = 1;
        }
      }
    }
    if (total == 0L) {
      return null;
    }
    return plain;
  }

  Object a1, a2;

  Object dclMulti() {
    if (a2 == null) {
      synchronized (this) {
        if (a2 == null) {
          a2 = new Object();
        }
      }
    }
    return a2;
  }

  static class StreamA extends InputStream {
    @Override
    public int read() throws IOException {
      return System.in.read();
    }
  }

  static class StreamB extends InputStream {
    @Override
    public int read() throws IOException {
      return 1;
    }
  }

  static class StreamC extends InputStream {
    @Override
    public int read() throws IOException {
      return 0;
    }

    @Override
    public int read(byte[] b, int off, int len) throws IOException {
      return -1;
    }
  }

  static class StreamD extends StreamC {
    @Override
    public int read() throws IOException {
      return System.in.read();
    }
  }

  static abstract class StreamE extends InputStream {
    @Override
    public int read() throws IOException {
      return System.in.read();
    }
  }

  static class StreamF extends java.io.FilterInputStream {
    StreamF(InputStream in) {
      super(in);
    }

    @Override
    public int read() throws IOException {
      return in.read();
    }
  }

  static class StreamG extends InputStream {
    public int read(byte[] b) throws IOException {
      return -1;
    }

    @Override
    public int read() throws IOException {
      int x = 1;
      return x;
    }
  }

  static class StreamH extends InputStream {
    public int read(int x) throws IOException {
      return -1;
    }

    @Override
    public int read() throws IOException {
      return 'c' + 1;
    }
  }

  class StreamInner extends InputStream {
    @Override
    public int read() throws IOException {
      return count++;
    }
  }

  @SuppressWarnings("InputStreamSlowMultibyteRead")
  static class StreamSuppressed extends InputStream {
    @Override
    public int read() throws IOException {
      return count();
    }

    static int count() {
      return 3;
    }
  }

  void anonymousStream() {
    new InputStream() {
      @Override
      public int read() throws IOException {
        return System.in.read();
      }
    };
  }

  static class StreamTwoReads extends InputStream {
    @Override
    public int read() throws IOException {
      return 4;
    }

    public int read(int a) {
      return a;
    }
  }

  static class StreamConstExpr extends InputStream {
    @Override
    public int read() throws IOException {
      return (1 + 2) * 3;
    }
  }

  static class StreamStaticConst extends InputStream {
    static final int K = 5;

    @Override
    public int read() throws IOException {
      return K;
    }
  }

  static class StreamBlock extends InputStream {
    @Override
    public int read() throws IOException {
      {
        return -1;
      }
    }
  }
}
