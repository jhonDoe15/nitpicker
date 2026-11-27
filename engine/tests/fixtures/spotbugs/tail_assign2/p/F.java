package p;

public class F {
    int f, g; static int s; F o; volatile int v; final int[] arr = new int[1];
    void a1() { int x = f; f = x; }
    void a2() { int x = this.f; this.f = x; }
    void a3() { int x = f; g = 1; f = x; }
    void a4(F p) { int x = p.f; p.f = x; }
    void a5() { int x = s; s = x; }
    void a6() { int x = f; x++; f = x; }
    void a7() { f = this.f; }
    void a8() { this.f = this.f; }
    void a9() { o.f = o.f; }
    void a10(F p) { p.f = p.f; }
    void a11() { v = v; }
    void a12() { int x = v; v = x; }
    void a13() { int x = f; m(); f = x; }
    void a14() { f = (int) f; }
    void a15() { f = f + 0; }
    void a16(F p) { f = p.f; }
    void a17() { int x = f; int y = x; f = y; }
    void a18() { int x = f; f = 2; f = x; }
    void a19() { long x = f; f = (int) x; }
    void a20() { int x; x = f; if (g > 0) f = x; }
    void a21() { g = f; f = g; }
    void a22() { int x = f, y = g; f = x; }
    void m() { }
    F() { f = f; }
    void a23(int f) { this.f = f; }
    void a24() { f = (f); }
    void a25() { int x = f; g = x; f = x; }
    void a26() { s = F.s; }
    void a27() { F.s = s; }
}
