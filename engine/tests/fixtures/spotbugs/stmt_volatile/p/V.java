package p;
public class V {
    volatile int a;
    volatile long b;
    volatile double c;
    volatile Integer boxed;
    volatile int[] arr = new int[1];
    static volatile int S;
    int plain;
    volatile String str = "";
    void f1() { a++; }
    void f2() { a--; }
    void f3() { ++a; }
    void f4() { a += 2; }
    void f5() { a = a + 1; }
    void f6() { b++; }
    void f7() { c++; }
    void f8() { boxed++; }
    void f9() { arr[0]++; }
    void f10() { S++; }
    void f11() { plain++; }
    void f12() { str += "x"; }
    void f13() { a *= 2; }
    void f14() { int x = a++; plain = x; }
    void f15(V o) { o.a++; }
    void f16() { this.a++; }
    void f17() { a = a - 1; }
    void f18() { a = 1 + a; }
    void f19() { b += 3; }
    void f20() { a |= 1; }
    void f21() { synchronized (this) { a++; } }
    synchronized void f22() { a++; }
    void f24() { a = plain + 1; }
    void f25() { a++; a++; }
    class In { void g() { a++; } }
    static void f26() { S += 1; }
    void f27() { a = a * 2; }
    void f28() { a = -a; }
    void f29() { a ^= 1; }
    void f30() { a <<= 1; }
}
