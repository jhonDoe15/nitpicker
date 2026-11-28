package p;

public class M {
    int f; int g; int h;
    int m2() { return 1; }
    void a1(int v, boolean b) { f = v; while (b) { f = v + 1; } }
    void a2(int v) { f = v; for (int i = 0; i < v; i++) { f = i; } }
    void a3(int v) { f = f = v; }
    void a4() { f = 1; f = 1; }
    void a5() { f = g; f = g; }
    void a6() { f = m2(); f = m2(); }
    void a7(int v) { g = 9; f = v; f = v + 1; }
    void a8(int v) { f = v; f = v + 1; g = 9; }
    void a9(int v) { f = v; f = v + 1; g = 9; h = 1; }
    void a10(int v) { h = v; h = v + 1; }
    void a11(int v) { h = v; h = v + 1; f = 1; }
    void a12(int v) { int t = v; f = t; f = v; }
    void a13(int v) { f = v; f = (short) v; }
    void a14(int v) { f = v; f = -v; }
    void a15(int v) { f = (v); f = ((v)); }
}
class M1 {
    final int fin = 1; int x; int y;
    void a1(int v) { y = v; y = v + 1; }
}
class M2 {
    private int x; protected int y; public int z; static int s;
    void a1(int v) { z = v; z = v + 1; }
}
class M3 extends M {
    int k;
    void a1(int v) { k = v; k = v + 1; }
    void a2(int v) { f = v; f = v + 1; }
}
class M4 {
    Integer x; int y; long z; Integer w;
    void a1(Integer v) { x = v; x = 5; }
    void a2(long v) { z = v; z = v + 1; }
}
class M5 {
    transient int x; volatile int y; int z;
    void a1(int v) { z = v; z = v + 1; }
    void a2(int v) { x = v; x = v + 1; }
}
class M6 {
    String a; Object b; CharSequence c;
    void a1(String v) { a = v; a = "x"; }
    void a2(Object v) { b = v; b = null; }
}
