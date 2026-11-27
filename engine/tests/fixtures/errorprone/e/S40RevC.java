import java.util.*;
public class S40RevC {
  static final boolean T = true;
  sealed interface S permits S1, S2 {}
  record S1() implements S {}
  record S2() implements S {}
  enum E { X, Y }
  int f(int i, E e, Object o, S s, String str) {
    int r = 0;
    switch (i) {
      case 1:
        while (T) { }
      case 2:
        while (1 < 2) { }
      case 3:
        while (!false) { r++; }
      case 4:
        for (; T; ) { }
      case 5:
        if (true) return 1;
      case 6:
        if (true) return 1; else return 2;
      case 7:
        do { switch (r) { case 1: break; } } while (true);
      case 8:
        while (true) { switch (r) { case 1: break; } }
      case 9:
        l: while (true) { switch (r) { case 1: break l; } }
      case 10:
        l2: do { do { continue l2; } while (true); } while (false);
      case 11:
        for (;;) { try { r++; } catch (Exception ex) { break; } }
      case 12:
        for (;;) { Runnable q = () -> { for (;;) { break; } }; }
      case 13:
        r = switch (r) { case 1: yield 1; default: { switch (r) { case 2: yield 7; default: yield 2; } } };
      case 14:
        switch (e) { case X: return 1; case Y: return 2; }
      case 15:
        switch (e) { case X -> { return 1; } case Y -> { return 2; } }
      case 16:
        switch (o) { case String x -> { return 1; } default -> { return 2; } }
      case 17:
        switch (o) { case null, default -> { return 2; } }
      case 18:
        switch (s) { case S1 a -> { return 1; } case S2 b -> { return 2; } }
      case 19:
        switch (str) { case "a": return 1; case "b": return 2; default: throw new Error(); }
      case 20:
        try { return 1; } finally { for (;;) { } }
      case 21:
        try { r++; } catch (RuntimeException ex) { return 1; } catch (Error ex2) { throw ex2; } finally { r++; }
      case 22:
        try { return 1; } catch (RuntimeException ex) { return 1; } finally { r++; }
      case 23:
        switch (i) { case 1 -> System.exit(0); default -> System.exit(1); }
      case 24:
        switch (i) { case 1 -> { System.exit(0); } default -> throw new Error(); }
      case 25:
        switch (i) { case 1: System.exit(0); default: throw new Error(); }
      case 26:
        label: switch (i) { case 1: break label; default: return 1; }
      case 27:
        switch (i) { case 1: { break; } default: return 1; }
      case 28:
        synchronized (this) { r++; }
      case 29:
        assert false;
      case 30:
        Runtime.getRuntime().exit(0);
      case 31:
        java.lang.System.exit(0);
      case 32:
        (System.class).hashCode();
      case 33:
        r++;
        System.exit(0);
        r++;
      case 34:
        { return 1; }
      case 35:
        { { } return 1; }
      case 36:
        class Loc { }
      case 37:
        throw new Error();
      default:
        return 0;
    }
  }
}
