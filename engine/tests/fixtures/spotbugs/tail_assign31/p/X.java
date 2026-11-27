package p;
public class X {
    int f; int g; String s; Object o;
    void p1(Object x) { { String v = s; } if (x instanceof String v) { s = v; } }
    void p2(Object x) { { String v = s; } switch (x) { case String v -> { s = v; } default -> {} } }
    void p3(Object[] x) { { Object v = o; } for (Object v : x) { o = v; } }
    void p4(String[] x) { { String v = s; } for (String v : x) { s = v; break; } }
    void p5(Exception x) { { Object v = o; } try { } catch (RuntimeException v) { o = v; } }
    void p6() { { Object v = o; } Runnable r = () -> { }; java.util.function.Function<Object,Object> fn = v -> { o = v; return v; }; }
    void p7(Object x) { String v = s; if (!(x instanceof String v2)) { return; } s = v2; }
    void p8(Object x) { { String v = s; } if (x instanceof String v && g > 0) { s = v; } }
    void p9(Object x) { String v = s; if (x instanceof String w) { v = w; } s = v; }
    void p10() { String v = s; { String w = v; } s = v; }
    void p11() { { String v = s; } String v; v = "a"; s = v; }
    void p12() { { String v = s; } String v = null; s = v; }
    void c1(int a) { int v = f; do { if (a > 0) continue; return; } while (false); f = v; }
    void c2() { int v = f; do { continue; } while (g > 0); f = v; }
    void c3() { f = f; do { continue; } while (false); f = f; }
    void c4(int a) { int v = f; for (;;) { if (a > 0) break; continue; } f = v; }
    int t1() { int v = f; try { return 1; } finally { f = v; } }
    int t2() { int v = f; try { return v; } catch (RuntimeException e) { f = v; return 2; } }
    int t3() { int v = f; try { g(); } finally { f = v; } return 1; }
    void t4() { int v = f; try { v = g; } catch (RuntimeException e) { } finally { f = v; } }
    void t5() { int v = f; try { } finally { try { } finally { f = v; } } }
    void t6() { try { f = f; return; } finally { } }
    void t7() { int v = f; for (;;) { try { break; } finally { f = v; } } }
    void t8() { int v = f; try { throw new Error(); } finally { f = v; } }
    void t9() { int v = f; l: try { break l; } finally { f = v; } }
    void g() {}
    void sx1(int k) { int v = f; switch (k) { case 1: v = g; case 2: f = v; } }
    void sx2(int k) { int v = f; switch (k) { case 1: return; case 2: f = v; } }
    void sx3(int k) { int v = f; for (;;) { switch (k) { case 1: continue; default: break; } break; } f = v; }
    void sx4(int k) { int v = f; int r = switch (k) { case 1: yield 1; default: { yield 2; } }; f = v; }
    void sx5(int k) { int v = f; int r = switch (k) { case 1 -> { if (g > 0) yield 1; yield 2; } default -> throw new RuntimeException(); }; f = v; }
    void sx6(int k) { int v = f; switch (k) { case 1 -> { for (;;) { break; } } default -> { } } f = v; }
    void sx7(int k) { int v = f; sw: switch (k) { case 1: switch (g) { case 1: break sw; } v = g; } f = v; }
    void sx8(int k) { switch (k) { case 1: int v = f; f = v; break; case 2: v = g; f = v; } }
    void sx9(int k) { switch (k) { case 1: int v = f; break; case 2: v = f; f = v; } }
}
