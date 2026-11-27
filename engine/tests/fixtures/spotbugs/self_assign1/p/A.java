package p;
public class A {
    int f; static int sf; String name; long big;
    void a1(int x) { x = x; foo(x); }
    void a2(int f) { f = f; }
    void a3() { int y = 3; y = y; foo(y); }
    void a4(String name) { name = name; }
    void a5(int sf) { sf = sf; }
    A(int f) { f = f; }
    void a6(long big) { big = big; }
    void a7(int x) { x = x; }
    void a8(Object o) { o = o; foo(1); }
    void a9(int x) { int y = x; y = y; y = y; foo(y); }
    void a10(int[] xs) { xs[0] = xs[0]; }
    void a11(int x) { x = (x); foo(x); }
    void a12(int x) { if (x > 0) { x = x; } foo(x); }
    void a13(double d) { d = d; foo(1); }
    void a14(int x) { for (int i = 0; i < x; i++) { i = i; } }
    void a15(int x) { Runnable r = () -> { int z = x; z = z; foo(z); }; r.run(); }
    void foo(int x) {}
    void foo(Object x) {}
    static class B { int g; void b1(int g) { g = g; } void b2() { int f = 1; f = f; foo(f); } void foo(int x) {} }
    class C { void c1(int f) { f = f; } }
    static class D extends A { D() { super(0); } void d1(int f) { f = f; } }
}
