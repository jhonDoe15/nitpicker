package p;
public class A {
    public Object a, b, c, d;
    void m1() { System.out.println(a); }
    void m2() { a = 1; b = 1; c = 1; d = 1; }
    A() { System.out.println(b); }
    void m3() { System.out.println(c); }
    static void m4(A x) { System.out.println(x.d); }
}
class B {
    void r(A x) { System.out.println(x.c); }
}
