package p;

public class E {
    int f;
    void m() { }
    void d1(int v) { f = v; f = v; }
    void d2(int v, int w) { f = v; f = w; }
    void d3() { f = 1; f = 2; }
    void d4(int v) { f = v; m(); f = v; }
    void d5(int v, boolean b) { f = v; if (b) { f = v; } }
    void d6(int v) { this.f = v; this.f = v; }
    void d7(E x, E y, int v) { x.f = v; y.f = v; }
    void d8(int v) { f = f = v; }
    void d9(int v) { int t = v; f = v; t++; f = v; }
}
class E2 {
    int f; long g; String h;
    void d1(int v) { f = v; f = v; }
}
class E3 {
    String a; String b; int c; String d;
    void d1(String v) { b = v; b = v; }
    void d2(String v) { a = v; a = v; }
    void d3(String v) { d = v; d = v; }
}
class E4 {
    int x; int y; int z;
    void d1(int v) { y = v; y = v; }
    void d2(int v) { z = v; z = v; }
    void d3(int v) { x = v; x = v; }
    void d4(int v) { x = v; y = v; x = v; }
}
class E5 {
    int x; static int s; int y;
    void d1(int v) { x = v; x = v; }
    void d2(int v) { s = v; s = v; }
    static void d3(int v) { s = v; s = v; }
}
class E6 {
    int x; final int fin = 1; int y;
    void d1(int v) { y = v; y = v; }
    void d2(int v) { y = v; x = 2; y = v; }
}
