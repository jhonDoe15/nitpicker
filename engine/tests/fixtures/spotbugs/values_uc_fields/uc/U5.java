package uc;

public class U5 {
    int f;
    int g;
    int[] arr;
    U5 next;
    static boolean q;
    String s;

    static void a() {}
    static void a(boolean v) {}
    static void viaHelper() { H5.run(); }
    void inst() {}

    void a1(int x) { if (x > 5) { if (x >= 5) a(); } }
    void a2(int x) { if (x > 5) { if (x != 5) a(); } }
    void a3(int x) { if (x > 5) { if (x >= 6) a(); } }
    void a4(int x) { if (x == 3) { if (x >= 3) a(); } }
    void a5(int x) { if (x > 5) { if (x < 5) a(); } }
    void a6(int x) { if (x > 5) { if (x >= 4) a(); } }
    void a7(int x) { if (x >= 6) { if (x > 5) a(); } }
    void a9(int x) { if (x > 5) { if (x > 3) { if (x > 3) a(); } } }
    void a10(int x) { if (x > 5) { if (x < 100) { if (x > 5) a(); } } }
    void a11(int x) { if (x > 5) { if (x < 100) { if (x < 100) a(); } } }
    void a12(int x) { if (x >= 2) { a(); if (x >= 2) a(); } }

    void b1(int x) { if (x > 5) { f = x < 3 ? 1 : 0; } }
    void b2(int x) { if (x > 5) { boolean t = x < 3; q = t; } }
    boolean b3(int x) { if (x > 5) { return x > 3; } return false; }
    void b4(int x) { if (x > 5) { f = x > 3 ? 0 : 1; } }
    void b5(int x) { if (x > 5) { a(x > 3); } }
    void b6(int x, int y) { if (x > 5) { q = x > 3 && y > 0; } }
    void b7(int x) { if (x > 5) { q = x > 3; } }

    void c1() { if (f < 0) return; a(); if (f < 0) a(); }
    void c2(U5 o) { if (o.f < 0) return; g = 1; if (o.f < 0) a(); }
    void c3() { if (f < 0) return; viaHelper(); if (f < 0) a(); }
    void c5() { if (f < 0) return; U5 t = new U5(); if (f < 0) a(); }
    void c6() { if (f < 0) return; Runnable r = () -> a(); if (f < 0) a(); }
    void c7() { int v = f; if (v < 0) return; if (f < 0) a(); }
    void c8(U5 o) { if (o.f < 0) return; int t = Math.abs(3); if (o.f < 0) a(); }
    void c9(U5 o) { if (o.f < 0) return; o.g = 2; if (o.f < 0) a(); }
    void c10() { if (f < 0) return; next.f = 2; if (f < 0) a(); }

    void d1() { if (s.length() > 5) { if (s.length() > 3) a(); } }
    void d2(double x) { if (x > 5) { if (x > 3) a(); } }
    void d3(float x) { if (x > 5) { if (x > 3) a(); } }
    void d4(Integer x) { if (x > 5) { if (x > 3) a(); } }
    void d5() { if (arr.length > 5) { if (arr.length > 3) a(); } }
    void d6(boolean b) { if (b) { if (!b) a(); } }
    void d7(long x) { if (x > 5000000000L) { if (x < 4000000000L) a(); } }
    void d8(char c) { if (c >= 'a' && c <= 'z') { if (c == '0') a(); } }
    void d9(char c) { if (c > 65) { if (c < 60) a(); } }
    void d10(byte v) { if (v > 5) { if (v < 3) a(); } }
    void d11(short v) { if (v > 5) { if (v < 3) a(); } }
    void d12(int x) { if (x > 5) { if (x < 3) a(); else a(); } }
    void d13(char c) { if (c > '\n') { if (c < '\t') a(); } }
    void d14(char c) { if (c > 200) { if (c < 150) a(); } }

    void e1(int x) { if (q) { if (x < 0) return; } else { if (x < 0) return; } if (x < 0) a(); }
    void e2(int x) { if (q) { if (x < 0) return; } else { if (x < 5) return; } if (x < 0) a(); }
    void e3(int x) { if (q) { if (x < 0) return; } if (x < 0) a(); }

    void f1(int x) { if (x < 5 || x < 3) a(); }
    void f2(int x) { if (x > 5 || x > 3) a(); }
    void f3(int x) { if (!(x > 5)) { if (x > 7) a(); } }

    void g1(int x) { switch (x) { case 1: if (x == 2) a(); break; default: break; } }
    void h1(int x) { if (x > 5) { int y = x; if (y < 3) a(); } }
    void i1(int n) { for (int i = 0; i < n; i++) { if (i < 0) a(); } }
    void i3() { int i; for (i = 0; i < 3; i++) { a(); } if (i < 3) a(); }
    void j1(int x) { if (x < 0) return; try { a(); } catch (RuntimeException e) { a(); } if (x < 0) a(); }
    void j2(int x) { try { if (x < 0) return; a(); if (x < 0) a(); } finally { a(); } }
}

class H5 { static void run() {} }
