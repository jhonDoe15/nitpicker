package p;

public class A {
    int f, g; static int s; A o; int[] arr = new int[2]; double d; long l; String str; Object obj;
    void a1() { f = f; }
    void a2() { this.f = f; }
    void a3() { s = s; }
    void a4(A x) { x.f = x.f; }
    void a5(A x) { f = x.f; }
    void a6() { o.f = o.f; }
    void a7(int f) { f = f; }
    void a8(int v) { int x = v; x = x; }
    void a9(int v) { int x; x = v; x = v; }
    void a10(int v) { f = v; f = v; }
    void a11() { arr[0] = arr[0]; }
    void a12() { str = str; }
    void a13() { d = d; }
    void a14() { l = l; }
    boolean b1() { return f == f; }
    boolean b2(int v) { return v == v; }
    boolean b3() { return f < f; }
    boolean b4() { return str.equals(str); }
    boolean b5(String v) { return v.equals(v); }
    int b6() { return f - f; }
    int b7(int v) { return v - v; }
    int b8(int v) { return v ^ v; }
    int b9(int v) { return v & v; }
    int b10(int v) { return v | v; }
    int b11() { return f & f; }
    int b12(int v) { return v / v; }
    int b13(int v) { return v % v; }
    void b14(int v) { int x = v; x -= x; f = x; }
    boolean b15(Object v) { return v == v; }
    boolean b16() { return obj == obj; }
    int b17(String v) { return v.compareTo(v); }
    boolean b18(A x) { return x.f == x.f; }
    boolean b19() { return f != f; }
    boolean b20(long v) { return v == v; }
    long b21(long v) { return v - v; }
    boolean b22(int v) { return v >= v; }
    boolean b23() { return this.equals(this); }
    int b24() { return f + f; }
    int b25(int v) { int w = v; return w - v; }
    boolean b26() { int x = f; return x == f; }
    boolean b27() { int x = f; m(); return x == f; }
    void m() { }
    void c1(int v) { f = v; g = v; f = v; }
    void c2(int v) { int x = v; x = v; x = v; f = x; }
    void c3(int v) { f = g = f; }
    void c4() { f = f++; }
    void c5(int v) { f = v; m(); f = v; }
    void c6(A x, int v) { x.f = v; x.f = v; }
    Object[] read() { return new Object[] { d, l }; }
}
