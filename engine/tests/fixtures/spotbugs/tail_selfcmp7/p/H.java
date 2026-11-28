package p;

import java.util.function.IntSupplier;

public class H {
    int f; int g; H o; int[] a = new int[1]; static int s;
    void m() { }
    int m2() { return 1; }
    long m3() { return 1; }
    static void sm() { }
    void d1(int v) { f = v; m3(); f = v; }
    void d2(int v) { f = v; int t = m2(); f = v; }
    void d3(int v) { f = v; int t = a[0]; f = v; }
    void d4(int v) { f = v; int t = g; f = v; }
    void d5(int v) { f = v; int t = f; f = v; }
    void d6(int v) { f = v; new Object(); f = v; }
    void d7(int v) { f = v; Object t = new Object(); f = v; }
    void d8(int v) { f = v; assert v > 0; f = v; }
    void d9(int v, Object x) { f = v; boolean t = x instanceof String; f = v; }
    void d10(int v, String x) { f = v; String t = x + v; f = v; }
    void d11(int v) { f = v; IntSupplier t = () -> 1; f = v; }
    void d12(int v, Object x) { f = v; String t = (String) x; f = v; }
    void d13(int v, boolean b) { f = v; int t = b ? 1 : 2; f = v; }
    void d14(H x, int v) { x.f = v; x.g = 2; x.f = v; }
    void d15(int v) { f = v; sm(); f = v; }
    void d16(int v) { f = v; int t = s; f = v; }
    void d17(int v) { f = v; H t = o; f = v; }
    void d18(int v) { f = v; o.m(); f = v; }
    void d19(int v) { f = v; int t = this.m2(); f = v; }
    void d20(int v, H x) { f = v; x.m(); f = v; }
    void d21(int v, H x) { f = v; int t = x.f; f = v; }
    void d22(int v) { f = v; a[0]++; f = v; }
    void d23(int v) { f = v; s++; f = v; }
    void d24(int v) { f = v; m(); m(); f = v; }
    void d25(int v) { f = v; f = v; f = v; }
    void d26(int v, int w) { f = v; f = w; f = v; }
    void d27(int v) { f = v; if (v > 0) { return; } f = v; }
    void d28(int v) { f = v; { f = v; } }
    void d29(int v) { f = v; long t = 1L; f = v; }
    void d30(int v) { f = v; String t = "x"; f = v; }
    void d31(int v) { f = v; Object t = null; f = v; }
    void d32(int v) { f = v; int[] t = new int[2]; f = v; }
    void d33(int v) { f = v; Class<?> t = H.class; f = v; }
    void d34(int v) { f = v; int t = a.length; f = v; }
}
