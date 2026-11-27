package p;
public class R {
    int f, g, h; R q;
    void m() { }
    void a1() { int x = f; g = x * 2; f = x; }
    void a2() { int x = f; g = x + 1; f = x; }
    void a3() { int x = f; int y = x / 2; f = x; }
    void a4() { int x = f; g = x; f = x; }
    void a5() { int x = f; g = -x; f = x; }
    void a6() { int x = f; int y = f; f = x; }
    void a7() { int x = f; g = h; f = x; }
    void a8() { int x = f; g = this.f; f = x; }
    void a9() { int x = f; h = g; f = x; }
    void a10() { int x = f; int y = x; f = y; }
    void a11() { int x = f; int y = x; x = 3; f = y; }
    void a12() { int x = f; x = 3; int y = 4; f = y; }
    void a13() { int x = f; int z = 3; f = x; }
    void a14() { int z = 3; int x = f; f = x; }
    void a15() { int x = f; g = 1; g = 2; f = x; }
    void a16() { int x = f; f = x; g = 1; }
    void a17() { int x = f; f = x; m(); }
    void a18() { int x = f; f = x; int z = 1; }
    void a19() { f = f; int z = 1; }
    void a20() { f = f; f = f; }
    void a21() { int x = f; f = x; f = x; }
    void a22() { int x = f; f = x; this.g = g; }
    void a23(boolean c) { int x = c ? f : f; f = x; }
    void a24(boolean c) { int x = f; if (c) { g = 1; } f = x; }
    void a25() { int x = f; f = x; return; }
    int a26() { int x = f; f = x; return x; }
    int a27() { int x = f; f = x; return 0; }
    void a28() { int x = f; f = x; x = 1; }
}
