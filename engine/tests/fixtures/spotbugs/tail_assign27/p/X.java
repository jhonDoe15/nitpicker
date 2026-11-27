package p;
import java.util.function.*;
public class X {
    int f; Integer boxed; short sh; String s; int[] ia;
    void a1() { int v = f; boxed += 1; f = v; }
    void a2() { int v = f; int k = -boxed; f = v; }
    void a3() { int v = f; boolean b = boxed > 2; f = v; }
    void a4() { int v = f; boolean b = boxed == null; f = v; }
    void a5() { int v = f; String t = "a" + boxed; f = v; }
    void a6() { int v = f; long l = 2; Long m = l; f = v; }
    void a7(Object o) { int v = f; switch (o) { case String t -> {} default -> {} } f = v; }
    void a8(Object o) { int v = f; if (o instanceof String t) { f = v; } }
    void d1() { int x = 0; short y = 0; x = x = y += 1; }
    void d2() { int x = 0; short y = 0; x = x = y = 1; }
    void d3() { int x = 0; int y = 0; x = x = y -= 1; }
    void d4() { int x = 0; int y = 0; x = x = y += 2; }
    void d5() { int x = 0; int y = 0; x = x = y = y = 1; }
    { class L { L(String z) { s = s; } } new L("a"); }
    void m() { class L2 { L2(int[] q) { ia = ia; } } new L2(null); Runnable r = () -> { class L3 { L3(String z) { s = s; } } new L3("a"); }; }
    static void st() { class L4 { String s; L4(String z) { s = s; } } new L4("a"); }
    class In { int[] g; In(int[]... z) { g = g; } In(String a, String s) { this(); X.this.s = X.this.s; } In() {} }
    void loops(int c) { int v = f; while (c > 0) { if (c == 1) continue; return; } f = v; }
    void loops2(int c) { int v = f; outer: for (int i = 0; i < c; i++) { for (;;) { continue outer; } } f = v; }
    void loops3(int c) { int v = f; do { if (c > 0) break; } while (true); f = v; }
    void loops4(int c) { int v = f; switch (c) { case 1: return; default: throw new IllegalStateException(); } }
}
