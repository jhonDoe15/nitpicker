package p;

public class C {
    int f, g; C o; long l; String str;
    void m() { }
    boolean k1() { int x = f; f = 3; return x == f; }
    boolean k2() { int x = f; g = 3; return x == f; }
    boolean k3(C q) { int x = f; q.f = 3; return x == f; }
    boolean k4() { int x = f; o = null; return x == f; }
    boolean k5(int v) { int x = v; v = 2; return x == v; }
    boolean k6(int v) { int x = v; v++; return x == v; }
    boolean k7(int v, boolean b) { int x = v; if (b) { v = 2; } return x == v; }
    boolean k8(int v, boolean b) { int x = v; if (b) { x = v; } return x == v; }
    boolean k9(int v, boolean b) { int x; if (b) { x = v; } else { x = v; } return x == v; }
    boolean k10(int v) { int x = v; int y = v; return x == y; }
    boolean k11(int v) { int x = v; return v == x; }
    boolean k12() { int x = f; return f == x; }
    boolean k13(C q) { C r = q; return r.f == q.f; }
    boolean k14(C q) { int x = q.f; q = new C(); return x == q.f; }
    boolean k15() { C r = this; return r.f == f; }
    boolean k16(int v) { for (int i = 0; i < 3; i++) { if (v == v) { return true; } } return false; }
    boolean k17() { for (int i = 0; i < 3; i++) { if (f == f) { return true; } m(); } return false; }
    boolean k18() { int x = f; for (int i = 0; i < 3; i++) { if (x == f) { return true; } f++; } return false; }
    boolean k19() { int x = f; synchronized (this) { return x == f; } }
    boolean k20() { int x = f; try { m(); } finally { g = 1; } return x == f; }
    boolean k21() { int x = f; try { m(); } catch (RuntimeException e) { return false; } return x == f; }
    boolean k22(long v) { long x = v; return x == v; }
    boolean k23(String v) { String x = v; return x.equals(v); }
    boolean k24() { String x = str; return x.equals(str); }
    boolean k25() { return str.equals(this.str); }
    boolean k26() { boolean same = f == f; return same; }
    boolean k27(int v) { return v == v && v > 0; }
    boolean k28() { int x = this.f; this.f = x; return x == f; }
    boolean k29() { int x = f, y = g; return x == y; }
    boolean k30() { int x = f; int y = x; return y == f; }
}
