package p;
public class V { int f, g; V o; int[] arr; String s; static int st;
    void m() { }
    void a1(long a, long b, int c, int d) { this.f = this.f; }
    void a2(long a, int b, long c, int d, int e) { this.f = this.f; }
    void a3() { int x = f; o.g = 1; f = x; }
    void a4() { int x = f; int y = arr[0]; f = x; }
    void a5() { int x = f; s = "a" + g; f = x; }
    void a6() { int x = f; arr = new int[3]; f = x; }
    void a7(int c) { int x = f; switch (c) { case 1: g = 1; break; default: g = 2; } f = x; }
    void a8(Object v) { int x = f; if (v instanceof String) g = 1; f = x; }
    void a9(boolean c) { int x = f; g = c ? 1 : st; f = x; }
    void a10(boolean c) { int x = f; boolean b = c && g > 0; f = x; }
    void a11() { int x = f; Runnable r = () -> { f = f; }; f = x; }
    void a12() {
        int x;
        x = x = 3;
        f = x;
        x = x = 4;
        g = x;
    }
    void a13() { int x = f; o.f = 1; f = x; }
    void a14() { int x = f; V w = o; f = x; }
    void a15() { int x = f; o = null; f = x; }
    void a16() { int x = o.f; o.f = x; }
    void a17() { int x = f; arr[0] = f; f = x; }
    void a18() { int x = f; String t = s + s; f = x; }
    void a19() { int x = f; Object t = (Object) s; f = x; }
    void a20(boolean c) { int x = f; if (c) { g = 1; } else { g = 2; } f = x; }
    void a21(boolean c) { int x = f; if (c) { return; } f = x; }
    void a22(boolean c) { int x = f; if (c) { throw new RuntimeException(); } f = x; }
    void a23() { int x = f; for (int i = 0; i < 1; i++) { } f = x; }
    void a24() { int x = f; do { g = 1; } while (false); f = x; }
    void a25() { int x = f; label: { if (g > 0) break label; g = 2; } f = x; }
    void a26() { int x = f; int[] a = {1, 2}; f = x; }
    void a27() { int x = f; long t = g; f = x; }
    void a28() { int x = f; g = (int) 2L; f = x; }
    void a29() { int x = f; Class<?> k = V.class; f = x; }
    void a30() { int x = f; g = st++; f = x; }
    void a31() { int x = f; g++; f = x; }
    void a32() { int x = f; this.g += 2; f = x; }
    void a33() { int x = f; f = x; } 
}
