package p;
public class A {
    static boolean c() { return true; }
    static void u() { }
    void e1(Boolean a, Boolean b) { while (a == b) break; }
    void e2(Boolean a, Boolean b) { while (c()) { if (a == b) break; } }
    void e3(Boolean a, Boolean b) { while (c()) { if (a == b) continue; } }
    void e4(Boolean a, Boolean b) { for (;;) { if (a == b) break; else break; } }
    void e5(Boolean a, Boolean b) { while (c()) { if (a == b) { break; } else { continue; } } }
    void e6(Boolean a, Boolean b) { while (c()) { if (a == b) continue; else continue; } }
    void e7(Boolean a, Boolean b) { for (;;) { if (a == b) break; u(); } }
    void e8(Boolean a, Boolean b) { u(); for (;;) { if (a == b) continue; } }
    void e9(Boolean a, Boolean b) { do { if (a == b) continue; } while (c()); }
    void e10(Boolean a, Boolean b) { do { if (a == b) break; } while (c()); }
    void e11(Boolean a, Boolean b) { for (int i = 0; i < 2; i++) { if (a == b) continue; } }
    void e12(Boolean a, Boolean b) { for (int i = 0; i < 2; i++) { if (a == b) break; } }
    void e13(Boolean a, Boolean b) { while (c()) { if (a == b) { continue; } } }
    void e14(Boolean a, Boolean b) { while (c()) { { if (a == b) continue; } } }
    void e15(Boolean a, Boolean b) { while (c()) { if (a == b) continue; else { } } }
    void e16(Boolean a, Boolean b) { while (c()) { if (a == b) { } else continue; } }
    void e17(Boolean a, Boolean b) { while (c()) { if (a == b) { ; } else { ; } } }
    void e18(Boolean a, Boolean b) { a: while (c()) { while (c()) { if (a == b) continue a; } } }
    void e19(Boolean a, Boolean b) { a: while (c()) { while (c()) { if (a == b) break a; } } }
    void e20(Boolean a, Boolean b) { a: while (c()) { while (c()) { if (a == b) break; } } }
    void e23(Boolean a, Boolean b) { switch (1) { case 1: if (a == b) break; case 2: } }
    void e25(Boolean a, Boolean b) { switch (1) { default: if (a == b) break; } u(); }
    void e26(Boolean a, Boolean b) { if (a == b) { a: { } } }
    void e27(Boolean a, Boolean b) { if (a == b) { { } } }
    void e28(Boolean a, Boolean b) { if (a == b) { { ; } ; } }
    void e29(Boolean a, Boolean b) { if (a == b) { if (false) { u(); } } }
    void e30(Boolean a, Boolean b) { if (a == b) { int x; } }
    void e31(Boolean a, Boolean b) { if (a == b) { int x = 1; } }
    void e32(Boolean a, Boolean b) { if (a == b) { final int x = 1; } }
    void e33(Boolean a, Boolean b) { if (a == b) { class L {} } }
    void e34(Boolean a, Boolean b) { if (a == b) { assert c(); } }
    void e35(Boolean a, Boolean b) { try { if (a == b) { } } catch (RuntimeException e) { } }
    void e36(Boolean a, Boolean b) { try { u(); } finally { if (a == b) {} } }
    void e37(Boolean a, Boolean b) { try { u(); } catch (RuntimeException e) { if (a == b) {} } }
    void e38(Boolean a, Boolean b) { synchronized (this) { u(); } if (a == b) {} }
}
