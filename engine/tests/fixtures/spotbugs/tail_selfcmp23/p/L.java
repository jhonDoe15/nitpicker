package p;

public class L {
    int f; int g; L o;
    void wf() { f = 1; }
    void wg() { g = 1; }
    void viaWf() { wf(); }
    void wo() { o.f = 1; }
    void empty() { }
    boolean e1() { int x = f; wf(); return x == f; }
    boolean e2() { int x = f; wg(); return x == f; }
    boolean e3() { int x = f; viaWf(); return x == f; }
    boolean e4() { int x = f; wo(); return x == f; }
    boolean e5() { int x = f; empty(); return x == f; }
    boolean e6() { int x = f; o.wf(); return x == f; }
    boolean e7(L p) { int x = p.f; p.wf(); return x == p.f; }
    boolean e8(L p) { int x = p.f; wf(); return x == p.f; }
    boolean e9() { int x = f; new L().wf(); return x == f; }
    boolean e10(Runnable r) { int x = f; r.run(); return x == f; }
    boolean n1(long x) { return (int) x == x; }
    boolean n2(long x) { int i = (int) x; long l2 = (long) i; return l2 == x; }
    boolean n3(int v) { return (long) v == v; }
    boolean n4(int v) { long w = v; return w == v; }
    boolean n5(int v) { return (byte) v == (byte) v; }
    boolean n6(int v) { return (byte) v == v; }
    boolean n7(short s) { return (int) s == s; }
    boolean n8(int v) { return (double) v == v; }
    boolean n9(long x) { int size = (int) x; return size != x; }
    boolean n10(int v) { int w = (int) (long) v; return w == v; }
    boolean n11(char c) { return (int) c == c; }
    boolean n12(byte b) { return (short) b == b; }
    long n13(long x, int v) { return x - (long) v - x; }
}
