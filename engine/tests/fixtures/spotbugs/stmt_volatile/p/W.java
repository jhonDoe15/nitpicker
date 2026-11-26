package p;
public class W {
    static final int ONE = 1;
    volatile byte by;
    volatile short sh;
    volatile char ch;
    volatile float fl;
    volatile int a;
    volatile long b;
    void f1() { by++; }
    void f2() { sh++; }
    void f3() { ch++; }
    void f4() { fl++; }
    void f5() { a += 1; }
    void f6() { a -= 1; }
    void f7() { a = a + ONE; }
    void f8() { b -= 1; }
    void f9() { b = b + 1; }
    void f10() { for (int i = 0; i < 3; a++) { i++; } }
    void f11(X x) { x.v++; }
    void f12() {
        a =
            a
            + 1;
    }
    void f13() {
        a
            ++;
    }
    void f14() { a += -1; }
    void f15() { b += 1L; }
    void f16() { a = (a + 1); }
    void f17() { if (a++ > 3) { a = 0; } }
    void f18() { b = 1 + b; }
}
class X { volatile int v; }
