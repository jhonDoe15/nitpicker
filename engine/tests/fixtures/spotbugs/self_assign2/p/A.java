package p;
public class A {
    int f; static int sf; String name;
    void a1(String f) { f = f; }
    void a2() { int f = 2; f = f; foo(f); }
    static void a3(int f) { f = f; }
    void a4(int x) { x = x; x = x; }
    void a5(int x) {
        x = x;
        foo(x);
        x = x;
    }
    void a6(int name) {
        name = name;
        foo(name);
        int y = 1;
        y = y;
        foo(y);
    }
    void a7(int x, int f) { x = x; f = f; }
    void a8(int x) { int y = x; foo(y); y = y; foo(y); }
    void a9(int x) { { int z = x; z = z; foo(z); } { int w = x; w = w; foo(w); } }
    void a10(int x) { int y = 0; foo(y); y = y; foo(y); }
    void foo(int x) {}
    void foo(Object x) {}
    enum E { Q; int k; void e1(int k) { k = k; } }
    record R(int r) { R { r = r; } void q(int r) { r = r; } }
    interface I { default void i1(int x) { x = x; } }
}
