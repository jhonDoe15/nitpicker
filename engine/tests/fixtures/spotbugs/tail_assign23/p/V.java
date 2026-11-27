package p;
public class V { int f, g; V o;
    void m() { }
    void a1(boolean c) { int x = f; if (c) { m(); return; } f = x; }
    void a2(boolean c) { int x = f; if (c) { f = 2; return; } f = x; }
    void a3(boolean c) { int x = f; if (c) { x = 1; return; } f = x; }
    void a4(boolean c) { int x = f; if (c) { o.f = 2; return; } f = x; }
    void a5(boolean c) { int x = f; if (c) { throw new IllegalStateException(); } f = x; }
    void a6(boolean c, RuntimeException e) { int x = f; if (c) { throw e; } f = x; }
    void a7(boolean c) { if (c) { m(); return; } int x = f; f = x; }
    void a8(boolean c) { int x = f; if (c) { m(); } else { return; } f = x; }
    void a9(boolean c) { while (c) { m(); } int x = f; f = x; }
    void a10(boolean c) { int x = f; for (;;) { if (c) break; } f = x; }
    void a11(boolean c) { int x = f; if (c) { g = 1; return; } f = x; }
    void a12(boolean c) { int x = f; switch (g) { case 1: m(); return; default: break; } f = x; }
    void a13(boolean c) { int x = f; try { g = 1; } catch (RuntimeException e) { m(); } f = x; }
    void a14(boolean c) { int x = f; try { g = 1; } catch (RuntimeException e) { m(); return; } f = x; }
    void a15(boolean c) { int x = f; try { g = 1; } finally { g = 2; } f = x; }
    void a16(boolean c) { try { m(); } catch (RuntimeException e) { } int x = f; f = x; }
    void a17(boolean c) { int x = f; if (c) { f = 3; } f = x; }
    void a18(boolean c) { int x = f; if (c) { int y = 1; } f = x; }
    void a19(boolean c) { int x = c ? f : 0; f = x; }
    void a20(boolean c) { int x = f; boolean b = c && o.g > 0; f = x; }
    void a21(boolean c) { int x = f; boolean b = c && o.f > 0; f = x; }
    void a22(boolean c) { int x = f; boolean b = c ? true : g > 0; f = x; }
}
