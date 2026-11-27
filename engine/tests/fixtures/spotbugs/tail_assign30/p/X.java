package p;
public class X {
    int f; int g;
    void t1(X y, boolean b) { int v = b ? y.f : y.f; y.f = v; }
    void t2(X y, boolean b) { int v; if (b) { v = y.f; } else { v = y.f; } y.f = v; }
    void t3(X y, boolean b) { if (b) { g = y.g; } else { g = y.g; } int v = y.f; y.f = v; }
    void t4(boolean b) { int v = b ? f : f; f = v; }
    void a1() { X y = this; y.f = f; }
    void a2() { X y = this; f = y.f; }
    void a3() { X y = this; y.f = y.f; }
    void a4() { X y = this; y.f = this.f; }
    void a5(X z) { X y = z; y.f = z.f; }
    void a6(X z) { X y = z; z.f = y.f; }
    void a7(X z) { X y = z; y.f = y.f; }
    void a8(X z) { X y = z; X w = y; w.f = z.f; }
    void a9(boolean b, X z) { X y = b ? z : z; y.f = z.f; }
    void a10(boolean b, X z) { X y; if (b) y = z; else y = z; y.f = z.f; }
    void a11(boolean b, X z) { X y; if (b) y = z; else y = z; int v = z.f; y.f = v; }
    void a12(X z) { X y = z; if (g > 0) { y = this; } y.f = z.f; }
}
