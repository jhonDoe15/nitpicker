package p;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;
public class A {
  static class T extends ThreadPoolExecutor { T() { super(1, 1, 1, TimeUnit.SECONDS, new LinkedBlockingQueue<>()); } }
  static class S extends ScheduledThreadPoolExecutor { S() { super(1); } }
  interface MyBQ extends BlockingQueue<String> {}
  static abstract class AQ extends AbstractQueue<String> implements BlockingQueue<String> {}
  static abstract class AE extends AbstractExecutorService {}
  void a(T t, S s, MyBQ q, AQ aq, AE ae, Callable<String> c) {
    t.submit(c);
    s.submit(c);
    q.offer("a");
    aq.offer("a");
    ae.submit(c);
  }
}
