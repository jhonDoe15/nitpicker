package e;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

class B7Async {
  static final AtomicInteger FIELD = new AtomicInteger();

  int counters() {
    AtomicInteger a = new AtomicInteger();
    a.incrementAndGet();
    a.set(4);
    return a.get();
  }

  int more() {
    AtomicInteger b = new AtomicInteger(5);
    b.getAndIncrement();
    b.addAndGet(3);
    b.decrementAndGet();
    b.getAndDecrement();
    return b.get();
  }

  long longs() {
    final AtomicLong c = new AtomicLong();
    c.compareAndSet(0, 1);
    return c.get();
  }

  boolean flags() {
    AtomicBoolean d = new AtomicBoolean(true);
    d.set(false);
    return d.get();
  }

  String refs() {
    AtomicReference<String> e = new AtomicReference<>("x");
    AtomicReference f = new AtomicReference();
    f.set(e.get());
    return e.get();
  }

  Object unfixable() {
    AtomicInteger g = new AtomicInteger();
    g.updateAndGet(x -> x + 1);
    return g.get();
  }

  void map() {
    ConcurrentHashMap<String, String> h = new ConcurrentHashMap<>();
    h.put("a", "b");
  }

  Object escapes(Runnable r) {
    AtomicInteger i = new AtomicInteger();
    r = () -> i.incrementAndGet();
    AtomicInteger j = new AtomicInteger();
    consume(j);
    AtomicInteger k = new AtomicInteger();
    k = new AtomicInteger();
    AtomicInteger l = new AtomicInteger();
    return l;
  }

  void consume(AtomicInteger x) {}

  int lambdaInside() {
    AtomicInteger m = new AtomicInteger();
    Runnable r = () -> m.incrementAndGet();
    r.run();
    return m.get();
  }

  @SuppressWarnings("UnnecessaryAsync")
  int suppressed() {
    AtomicInteger n = new AtomicInteger();
    return n.get();
  }
}
