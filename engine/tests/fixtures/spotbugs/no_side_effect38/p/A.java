package p;
import java.util.concurrent.*;
public class A {
  void m(ExecutorService ex, int k) {
    ex.submit(() -> { while (true) { switch (k) { case 1: break; default: foo(); } } });
    ex.submit(() -> { while (true) { for (;;) { break; } } });
    ex.submit(() -> { while (true) { foo(); } });
    ex.submit(() -> { out: while (true) { if (k > 1) break out; } });
  }
  static void foo() { }
}
