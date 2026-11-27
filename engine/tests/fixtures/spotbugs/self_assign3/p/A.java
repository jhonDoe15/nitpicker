package p;
public class A {
    int f;
    void a1(int x, boolean c) { if (c) x = 1; x = x; foo(x); }
    void a2(int x, int n) { for (int i = 0; i < n; i++) { x = x; x = 2; } foo(x); }
    void a3(int x) {
        x = x;
        foo(x);
    }
    void a4() {
        int y = 1;
        y = y;
        foo(y);
        y = y;
        foo(y);
    }
    void a5(int x) {
        int y = x;
        y = y;
        foo(y);
        int z = x;
        z = z;
        foo(z);
    }
    void a6(int x) { foo(x); x = 3; foo(x); x = x; foo(x); }
    void a7(int x, boolean c) { x = x; if (c) x = 1; foo(x); }
    void a8(int x) { foo(x++); x = x; }
    void a9(int x) { x += 1; x = x; }
    void a10(int x) { int y; y = x; x = x; foo(y); }
    void foo(int x) {}
}
