package p;
public class A {
    int f; String s; Object o; long g;
    void a1(int f, int x) { f = x; }
    void a2(int x) { int f = x; }
    void a3(int f) { f = f; }
    void a4(String s, String t) { s = t; }
    void a5(String t) { String s = t; }
    void a6(Object o, Object t) { o = t; }
    void a7(int x) { int f = 1; foo(f); f = x; }
    void a8(int f) { f = f + 1; }
    void a9(int f, A a) { f = a.f; }
    void a10(int f) { f = new Object().hashCode(); }
    void a11(long g, long h) { g = h; }
    void foo(int x) {}
}
