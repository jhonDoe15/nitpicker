package p;
public class A {
    static int sf; int f;
    static void a1() { int sf = ir(); foo(sf); sf = ir(); }
    void a2() { int sf = ir(); foo(sf); sf = ir(); }
    static void a3() { int sf = ir(); }
    void a4() { int sf = ir(); }
    static void a5() { int f = ir(); }
    static void a6() { int sf = 0; sf = sf; }
    void a7() { int sf = 0; sf = sf; }
    void a8() { int f = 0; f = f; }
    static int ir() { return 1; }
    static void foo(int x) {}
}
