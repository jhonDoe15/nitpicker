package p;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;
public class A {
  static class F1 extends File { F1() { super("x"); } }
  static class F2 extends F1 { }
  static class F3 extends F2 { public boolean delete() { return false; } }
  static abstract class FA extends File { FA() { super("x"); } }
  static class E1 extends AbstractExecutorService {
    public void shutdown() {} public List<Runnable> shutdownNow() { return null; } public boolean isShutdown() { return false; }
    public boolean isTerminated() { return false; } public boolean awaitTermination(long t, TimeUnit u) { return false; } public void execute(Runnable r) {}
  }
  static abstract class E2 extends AbstractExecutorService { }
  void a(F1 f1, F2 f2, F3 f3, FA fa, E1 e1, E2 e2, Callable<String> c, ThreadPoolExecutor tpe, ForkJoinPool fj) {
    f1.delete();
    f2.delete();
    f3.delete();
    fa.delete();
    e1.submit(c);
    e2.submit(c);
    tpe.submit(c);
    fj.submit(c);
  }
}
