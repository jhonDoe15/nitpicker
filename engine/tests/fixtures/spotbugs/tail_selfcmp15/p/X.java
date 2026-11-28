package p;

public class X {
    int f; int g; String s; X o;
    void m() { }
    int m2() { return 1; }
    int m3() { return 1; }
    int m4(int a) { return a; }
    void d1(int v, int w) { f = v + 1; f = w * 3; }
    void d2() { f = m2(); f = m3(); }
    void d3() { f = m4(1); f = m4(2); }
    void d4() { f = 1; f = 2; }
    void d5() { f = 3; f = 3; }
    void d6(int v) { f = -v; f = -v; }
    void d7(int v) { f = v + 1; f = v + 1; }
    void d8() { s = "a"; s = "b"; }
    void d9() { s = "a"; s = "a"; }
    void d10() { s = null; s = null; }
    void d11(X a, X b) { f = a.g; f = b.g; }
    void d12() { f = g; m(); f = g; }
    void d13(int v) { f = v; f = (v); }
    void d14(int[] a) { f = a[0]; f = a[1]; }
    void d15(int v) { f = v; f = f + 1; }
    void d16(int v) { f = v; f = v - 0; }
    void d17(long v) { f = (int) v; f = (int) v; }
    void d18(X a) { a.f = 1; this.f = 1; }
    void d19(X a) { X b = a; b.f = 1; a.f = 2; }
    void d20(X a) { a.f = 1; a = this; a.f = 2; }
    boolean n1() { int x = f; int y = f; for (int i = 0; i < 2; i++) { if (x == y) { return true; } } return false; }
    boolean n2() { int x = f; int y = f; for (int i = 0; i < 2; i++) { if (x == y) { return true; } m(); } return false; }
    boolean n3() { int x = f; int y = f; for (int i = 0; i < 2; i++) { if (x == y) { return true; } g = i; } return false; }
    boolean n4() { int x = f; int y = f; while (g > 0) { g--; } return x == y; }
    boolean n5() { int x = f; int y = f; while (g > 0) { m(); } return x == y; }
    boolean n6() { int x = f; int y = f; if (g > 0) { m(); } return x == y; }
}
