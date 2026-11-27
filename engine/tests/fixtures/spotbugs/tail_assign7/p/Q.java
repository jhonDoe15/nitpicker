package p;
public class Q {
    int f, g; long l; String s; Object o; byte b; short sh; char ch; boolean z; Q q; int[] arr;
    static int st;
    void m() { }
    static void sm() { }
    void p1(long a) { l = l; }
    void p2(long a, long b2) { l = l; }
    void p3(String a) { s = s; }
    void p4(Object a) { s = s; }
    void p5(String a) { o = o; }
    void p6(int a) { b = b; }
    void p7(byte a) { b = b; }
    void p8(boolean a) { z = z; }
    void p9(int a, boolean c) { f = f; }
    void p10(Integer a) { f = f; }
    void p11(int... a) { f = f; }
    void p12(int a) { int x = f; f = x; }
    void p13(int a, Q r) { r.f = r.f; }
    void p14(int a, int b2) { this.f = this.f; }
    void p15(int a) { s = s; }
    Q(int a) { f = f; }
    Q() { }
    void k1() { int x = f; sm(); f = x; }
    void k2() { int x = f; new Object(); f = x; }
    void k3(Q r) { int x = f; r.f = 3; f = x; }
    void k4() { int x = f; arr[0] = 1; f = x; }
    void k5() { int x = f; st = 2; f = x; }
    void k6(boolean c) { int x = f; if (c) x = 1; f = x; }
    void k7(boolean c) { int x = f; if (c) m(); f = x; }
    void k8(boolean c) { int x = f; while (c) { c = g > 0; } f = x; }
    void k9() { int x = f; synchronized (this) { g = 1; } f = x; }
    void k10() { int x = f; f = x + 0; }
    void k11() { int x = f; int y = g; f = y; }
    void k12() { int x = f; g = f; f = x; }
    void k13() { int x = f; String t = s.trim(); f = x; }
    void k14() { int x = f; int y = x; x = 3; f = y; }
    void k15(boolean c) { int x = c ? f : f; f = x; }
    void k16() { int x = f; try { g = 1; } catch (RuntimeException e) { } f = x; }
    void k17() { int x = q.f; q.f = x; }
    void k18(Q r) { int x = r.f; this.f = x; }
    void k20() { int x = f; g = x / 2; f = x; }
    void k21() { int x = f; Runnable r = () -> {}; f = x; }
    void k22() { int x = f; assert g > 0; f = x; }
    void k23() { st = st; }
    void k24() { Q.st = Q.st; }
    void k25() { int x = st; st = x; }
    void k26() { int x = f; f = x; f = x; }
    void k27() { int x = f; for (int i = 0; i < 2; i++) { f = x; } }
    void k28() { int x = f; for (int i = 0; i < 2; i++) { f = x; x = g; } }
}
