package p;

import java.util.function.IntPredicate;

public class N {
    int f; int g; N o; static int s;
    void m() { }
    int m2() { return 1; }
    int m3() { return 1; }
    boolean b1() { int x = f; for (int i = 0; i < 3; i++) { if (x == f) { return true; } m(); } return false; }
    boolean b2() { int x = f; while (g > 0) { if (x == f) { return true; } g--; } return false; }
    boolean b3(int v) { int x = v; for (int i = 0; i < 3; i++) { if (x == v) { return true; } v++; } return false; }
    boolean b4(int v) { int x = v; for (int i = 0; i < 3; i++) { if (x == v) { return true; } x++; } return false; }
    boolean b5(int v) { int x = v; for (int i = 0; i < 3; i++) { if (x == v) { return true; } } return false; }
    boolean b6() { int x = f; for (int i = 0; i < 3; i++) { if (x == f) { return true; } } return false; }
    boolean b7() { int x = f; for (int i = 0; i < 3; i++) { if (x == f) { return true; } f = i; } return false; }
    boolean b8() { int x = f; if (g > 0) { f = 1; } return x == f; }
    boolean b9() { int x = f; if (g > 0) { g = 1; } return x == f; }
    boolean b10() { int x = f; if (g > 0) { m(); } return x == f; }
    boolean b11(int v, boolean c) { int x = c ? v : v; return x == v; }
    boolean b12() { IntPredicate p = v -> v == v; return p.test(1); }
    static boolean b13(int v) { return v == v; }
    static boolean b14(N q) { return q.f == q.f; }
    boolean b15() { return s == s; }
    N(int v) { if (v == v) { f = 1; } }
    N() { if (f == f) { g = 1; } }
    boolean b16(int a, int b, int c, int d, int e) { return e == e; }
    boolean b17(long a, int e) { return e == e; }
    boolean b18() { int x = f; int y = f; m(); return x == y; }
    boolean b19() { int x = f; f = 2; int y = f; return x == y; }
    boolean b20() { int x = f; g = f; return x == g; }
    boolean b21() { int x = this.f; return x == this.f; }
    boolean b22(N q) { int x = q.f; q.f = 2; return x == q.f; }
    boolean b23(N q, N r) { int x = q.f; r.f = 2; return x == q.f; }
    boolean b24(N q) { int x = q.f; f = 2; return x == q.f; }
    boolean b25() { int x = f; o.g = 1; return x == f; }
    boolean b26() { int x = o.f; return x == o.f; }
    class In { int h; boolean c1() { return f == f; } boolean c2() { return h == N.this.h2; } }
    int h2;
    boolean b27() { int x = f; try { return x == f; } catch (RuntimeException e) { return false; } }
    boolean b28() { int x = f; switch (g) { case 1: f = 3; break; default: break; } return x == f; }
    boolean b29() { int x = f; f++; return x == f; }
    boolean b30() { int x = f; s = 2; return x == f; }
    boolean b31() { int x = f; int[] a = new int[1]; a[0] = 2; return x == f; }
}
