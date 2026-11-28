package p;

public class K {
    int f; int g; static int s;
    void m() { }
    void a1(int v, int w) { f = v; f = 100; }
    void a2(int v, int w) { f = v; f = 1000; }
    void a3(int v, int w) { f = v; f = w + 1000; }
    void a4(int v, int w) { f = v; f = w + 1000 + 1000; }
    void a5(int v, int w) { f = v; f = w + 1000 + 1000 + 1000; }
    void a6(int v, int w) { f = v; f = w + 1000 + 1000 + 1000 + 1000 + 1000 + 1000; }
    void a7(int v, int w) { f = v; int t = 1000; f = w; }
    void a8(int v, int w) { f = v; int t = 100; f = w; }
    void a9(int v, int w) { f = v; int t = 100; int u = 1; f = w; }
    void a10(int v, int w) { f = v; int t = 1; int u = 1; f = w; }
    void a11(int v, int w) { f = v; int t = 1; int u = 1; int x = 1; f = w; }
    void a12(int v, int w) { f = v; m(); f = w; }
    void a13(int v, int w) { f = v; m(); f = w + 1000; }
    void a14(int v, int w) { f = v; m(); int t = 1; f = w; }
    void a15(int v, int w) { f = v; f = w; m(); }
    void a16(int v, int w, boolean b) { f = v; if (b) { } f = w; }
    void a18(int v, int w, int x, int y, int z) { f = z; f = y; }
    void a19(int v, int w, int x, int y, int z) { f = z; int t = 1; f = y; }
    void a20(int v, int w, int x, int y, int z) { f = z; int t = 1; int u = 1; f = y; }
}
