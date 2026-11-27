package p;

public class J {
    int f; long l; Object o;
    void s1() { int x = f; f = x; }
    void s2(int a) { int x = f; f = x; }
    void s3(int a, int b) { int x = f; f = x; }
    void s4(int a, int b, int c) { int x = f; f = x; }
    void s5(int a, int b, int c, int d) { int x = f; f = x; }
    void s6(J p) { p.f = p.f; }
    void s7(int a, J p) { p.f = p.f; }
    void s8(int a, int b, int c, J p) { p.f = p.f; }
    void s9(int a, int b, int c, J p) { int x = p.f; p.f = x; }
    void s10(int a, int b, int c) { long x = l; l = x; }
    void s11(int a) { long x = l; l = x; }
    void s12(int a, int b) { Object x = o; o = x; }
    void s13(int a, int b, int c) { Object x = o; o = x; }
    void s14() { f = f; }
    static void s15(J p) { p.f = p.f; }
    static void s16(J p) { int x = p.f; p.f = x; }
    void s17(J p) { J q = p; q.f = q.f; }
}
