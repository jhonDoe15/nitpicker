import java.util.*;
public class S40RevA {
  enum E { X, Y, Z }
  int f(int i, E e, Object o) {
    int r = 0;
    switch (i) {
      case 1:
        try { r++; } finally { r--; }
      case 2:
        try { return 1; } finally { r--; }
      case 3:
        try { return 1; } catch (Exception ex) { r++; }
      case 4:
        outer:
        for (;;) { break outer; }
      case 5:
        lbl: { break lbl; }
      case 6:
        lbl2: { return 1; }
      case 7:
        while (true) { switch (r) { case 1: break; default: continue; } }
      case 8:
        do { break; } while (true);
      case 9:
        do { continue; } while (false);
      case 10:
        for (int k : new int[0]) { return 1; }
      case 11:
        synchronized (this) { return 1; }
      case 12:
        if (r > 0) return 1; else throw new RuntimeException();
      case 13:
        System.exit(0);
      case 14:
        { }
      case 15:
        ;
      case 16:
        switch (r) { case 1: return 1; default: return 2; }
      case 17:
        switch (r) { case 1: return 1; default: break; }
      case 18:
        switch (r) { default -> { return 2; } }
      case 19:
        switch (r) { case 1 -> r++; default -> throw new RuntimeException(); }
      case 20:
        while (r > 0) { if (r == 3) break; }
      case 21:
        x: while (true) { while (true) { break x; } }
      case 22:
        x2: while (true) { while (true) { continue x2; } }
      case 23:
        for (;;) { try { break; } finally { } }
      case 24:
        try { throw new RuntimeException(); } finally { return 1; }
      case 25:
        r = switch (r) { case 1 -> 2; default -> { yield 3; } };
      case 26:
        Runnable q = () -> { return; };
      case 27:
        while (true) { Runnable q2 = () -> { while(true) { break; } }; }
      default:
        return 0;
    }
  }
  void g(int i) {
    switch (i) {
      case 1 -> System.out.println();
      case 2 -> { }
    }
    switch (i) {
      case 1, 2:
        System.out.println();
      case 3:
        break;
      // fall through
      case 4:
        return;
      /* falls-through */
      case 5:
        System.out.println();
        // fallthrough
      default:
    }
  }
}
