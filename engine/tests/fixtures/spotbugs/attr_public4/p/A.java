package p;
public class A {
    public int t1, t2, t3, t4, t5, t6, t7, t8;
    void b1() { t1 = 1; }
    void a1() { t1 = 2; }
    void a2() { t2 = 1; }
    void b2() { t2 = 2; }
    void m3() { t3 = 1; }
    A() { t3 = 2; t5 = 1; }
    void m4() { Runnable r = () -> t4 = 1; r.run(); }
    void n4() { t4 = 2; }
    A(int x) { t5 = 2; }
    void m5() { t5 = 3; }
    void m6() { t6 = 1; }
    void m7() { t7 = 1; }
    static void s8(A a) { a.t8 = 1; }
    void m8() { t8 = 2; }
}
class B extends A {
    void w() { t6 = 9; }
}
