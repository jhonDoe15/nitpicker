package p;

public class G {
    int f; int g; long l; long l2; G o;
    static int s; static int s2;
    void m() { }
    int m2() { return 1; }
    void d1(int v, int w) { f = v; f = w; }
    void d2(int v) { f = v; m(); f = v; }
    void d3(int v, int w) { f = v; m(); f = w; }
    void d4(int v, boolean b) { f = v; if (b) { m(); } f = v; }
    void d5(int v, boolean b) { f = v; if (b) { f = v; } }
    void d6(int v) { f = v; int t = v + 1; f = v; }
    void d7(int v) { f = v; for (int i = 0; i < 2; i++) { m(); } f = v; }
    void d8(int v) { f = v; g = 2; f = v; }
    void d9(int v) { f = v; o.f = 2; f = v; }
    void d10(int v) { f = v; s = 2; f = v; }
    void d11(int v) { f = v; int[] a = new int[1]; a[0] = 1; f = v; }
    void d12(int v) { f = v; f = m2(); }
    void d13(int v) { f = v; f = v + 1; }
    void d14(int v) { f = v; f++; }
    void d15(int v) { f = v; f += 1; }
    void d16() { f = f++; }
    void d17(long v) { l = v; l = v; }
    void d18(long v, long w) { l = v; l = w; }
    void d19(G x, int v) { x.f = v; x.f = v; }
    void d20(G x, int v, int w) { x.f = v; x.f = w; }
    void d21(G x, int v) { G y = x; x.f = v; y.f = v; }
    void d22(int v) { o.f = v; o.f = v; }
    void d23(int v) { s = v; s = v; }
    void d24(int v, int w) { s = v; s = w; }
    void d25(int v, int w) { f = v; g = w; f = w; }
    void d26(int v) { f = v; this.f = v; }
    void d27(int v) { f = v; v = 3; f = v; }
    void d28(int v) { int t; f = v; t = 2; f = v; }
    void d29(int v) { f = v; m2(); f = v; }
    void d30(int v) { f = v; f = g; }
    void d31(int v) { f = v; f = f; }
    void d32() { f = g = f; }
    void d33(int v) { f = v; try { m(); } finally { f = v; } }
    void d34(int v, boolean b) { if (b) { f = v; } f = v; }
    void d35(int v) { f = v; synchronized (this) { f = v; } }
    void d36(int v, int w) { this.f = v; this.f = w; }
}
