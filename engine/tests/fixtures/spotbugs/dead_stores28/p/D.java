package p;
public class D {
    int f; Object g;
    void s1(int x) { x = x; }
    void s2(int x) { x = x; x = 3; }
    void s3(int x) { int y = x; y = y; }
    void s4(int x) { int y = x; y = y; y = 5; }
    void s5(int x, boolean q) { int y = 1; y = y; if (q) y = 2; }
    void s6(Object x) { Object y = x; y = y; }
    void s7() { int f = 1; f = f; }
    void s8() { Object g = null; g = g; }
    void s9(int g) { g = g; foo(g); }
    void s10(int x, boolean q) { int y = 1; y = y; while (q) { y = 2; } }
    void s11() { int y = 1; for (int i=0;i<2;i++) { y = y; } }
    void s12() { long y = 1; y = y; }
    void s13() { String y = "a"; y = y; }
    void s14(boolean q) { int y = 1; if (q) { y = y; } }
    void s15() { int y = 1; y = y; return; }
    void s16(int x) { x = x; foo(1); }
    void s17(int x) { x += 0; }
    void s18() { int y = 0; y = (y); }
    void s19() { int y = 0; (y) = y; }
    void s20(boolean q) { int y = 0; y = y; try { foo(y); } finally { y = 3; } }
    void s21() { Object y = this; y = y; y = 1; }
    static void foo(Object o) {}
    static void foo(int o) {}
}
