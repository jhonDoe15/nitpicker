package p;
import java.util.*;
public class X {
    enum E { A, B, C }
    sealed interface S permits S1, S2 {}
    record S1(int a) implements S {}
    record S2(int a) implements S {}
    int f; int g; Integer boxed; String s; E e;
    void en(E k) { int v = f; switch (k) { case A: break; default: } f = v; }
    void en2(E k) { int v = f; switch (k) { case A -> {} default -> {} } f = v; }
    void en3() { int v = f; switch (e) { case A -> {} default -> {} } f = v; }
    void str(String k) { int v = f; switch (k) { case "a" -> {} default -> {} } f = v; }
    void str2(String k) { int v = f; int r = switch (k) { case "a" -> 1; default -> 2; }; f = v; }
    void box(Integer k) { int v = f; switch (k) { case 1 -> {} default -> {} } f = v; }
    void chr(char k) { int v = f; switch (k) { case 'a' -> {} default -> {} } f = v; }
    void pat(Object k) { int v = f; switch (k) { case String t -> {} default -> {} } f = v; }
    void pat2(S k) { int v = f; switch (k) { case S1 t -> {} case S2 t -> {} } f = v; }
    void inst(Object k) { int v = f; if (k instanceof String t) { } f = v; }
    void bx() { int v = f; Integer i = 1; f = v; }
    void bx2() { int v = f; int i = boxed; f = v; }
    void bx3() { int v = f; boxed++; f = v; }
    void bx4() { int v = f; boxed = boxed; f = v; }
    void bx5() { boxed = boxed; }
    void bx6() { f = boxed; g = g; }
    void arrlen(int[] a) { int v = f; int n = a.length; a[0] = 1; int[] b = new int[3]; f = v; }
    void arrnew() { int v = f; int[][] b = new int[3][3]; f = v; }
    void arrnew2() { int v = f; int[] b = {1,2}; f = v; }
    void conc() { int v = f; String t = "a" + s + g; t += s; f = v; }
    void conc2() { int v = f; String t = "a"; t += 1; f = v; }
    void lamb() { int v = f; Runnable r = this::bx; Runnable q = () -> {}; f = v; }
    void div(int a) { int v = f; int z = 5 / a; f = v; }
    void nul(Object o) { int v = f; o.hashCode(); f = v; }
    void cmp(Object o) { int v = f; boolean b = o == null; f = v; }
    void lng() { long l = 1; int v = f; l++; f = v; }
    void cls() { int v = f; Class<?> c = String.class; f = v; }
    void tw() { int v = f; try (AutoCloseable a = null) { } catch (Exception x) { } f = v; }
    void tw2() { try (AutoCloseable a = null) { f = f; } catch (Exception x) { } }
    void thrw() { int v = f; try { throw new RuntimeException(); } catch (RuntimeException x) { } f = v; }
    void ins(Object o) { int v = f; boolean b = o instanceof String; f = v; }
    void cast(Object o) { int v = f; String t = (String) o; f = v; }
    void sync() { int v = f; synchronized (this) { } f = v; }
    void sync2() { int v = f; synchronized (this) { v = f; } f = v; }
    void unreach() { int v = f; for (;;) { if (g > 0) return; } }
    void w1() { int v = f; while (g > 0) { return; } f = v; }
    void w2() { int v = f; while (g > 0) { break; } f = v; }
    void w3() { int v = f; for (int i = 0; i < 2; i++) { break; } f = v; }
    void w4() { int v = f; for (int i = 0; i < 2; i++) { if (g > 0) break; } f = v; }
    void w5() { int v = f; do { break; } while (g > 0); f = v; }
    void w6() { int v = f; do { return; } while (g > 0); }
    void w7() { int v = f; do { } while (g > 0); f = v; }
    void w8() { int v = f; for (int i : new int[0]) { break; } f = v; }
    void w9() { int v = f; while (true) { if (g > 0) break; v = g; } f = v; }
    void w10() { int v = f; while (true) { break; } f = v; }
    void w11() { int v = f; while (true) { throw new RuntimeException(); } }
    void w12() { int v = f; while (g > 0) { throw new RuntimeException(); } f = v; }
    void w13() { int v = f; outer: while (g > 0) { while (g > 1) { break outer; } break; } f = v; }
    void w14() { int v = f; while (g > 0) { continue; } f = v; }
    void w15() { int v = f; for (;;) { try { break; } finally { } } f = v; }
    void w16() { int v = f; for (int i = 0; i < 1; i++) { switch (i) { case 0: break; } } f = v; }
    void w17() { int v = f; do { if (g > 0) continue; break; } while (g > 5); f = v; }
    void w18() { int v = f; do { continue; } while (false); f = v; }
    void w19() { int v = f; do { v = 1; } while (false); f = v; }
    void w20() { int v = f; do { v = f; } while (false); f = v; }
    void w21() { do { f = f; } while (g == 0 && false); }
}
