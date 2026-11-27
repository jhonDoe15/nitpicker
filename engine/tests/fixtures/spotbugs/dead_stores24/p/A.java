package p;
public class A {
    void a1(int x, int n) { for (int i = 0; i < n; i++) { x = x; x = 2; } foo(x); }
    void a2(int x) { x = x; x = 2; foo(x); }
    void a3(int x) { int y = x; foo(y); y = y; y = 3; foo(y); }
    void a4(int x, int z) { x = z; x = 2; foo(x); }
    void a5(int x) { int y = x; foo(y); y = x; y = 3; foo(y); }
    void a6(String x) { x = x; x = "a"; foo(x); }
    void foo(Object x) {}
}
