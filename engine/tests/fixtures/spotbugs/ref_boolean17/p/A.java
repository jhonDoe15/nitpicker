package p;
public class A {
    static void x() { }
    void e1(Boolean a, Boolean b) { if (a == b) {} }
    void e2(Boolean a, Boolean b) { if (a == b) { } else { } }
    void e3(Boolean a, Boolean b) { if (a == b) return; }
    void e4(Boolean a, Boolean b) { while (a == b) break; }
    void e5(Boolean a, Boolean b) { while (a == b) { x(); break; } }
    void e6(Boolean a, Boolean b) { boolean q = a == b; }
    void e7(Boolean a, Boolean b) { for (;;) { if (a == b) break; } }
    void e8(Boolean a, Boolean b) { lbl: if (a == b) break lbl; }
    void e9(Boolean a, Boolean b) { lbl: { if (a == b) break lbl; } }
    void e10(Boolean a, Boolean b, boolean c) { while (c && a == b) break; }
    void e11(Boolean a, Boolean b) { if (a == b) { x(); } }
    void e12(Boolean a, Boolean b) { do { } while (a == b); }
    void e13(Boolean a, Boolean b) { if (a == b) { ; } }
    void e14(Boolean a, Boolean b) { if (a == b) { int z = 1; } }
    void e15(Boolean a, Boolean b) { for (int i = 0; i < 1; i += a == b ? 1 : 2) { break; } }
    void e16(Boolean a, Boolean b) { while (true) { if (a == b) break; else break; } }
    int e17(Boolean a, Boolean b) { if (a == b) return 1; return 1; }
    int e18(Boolean a, Boolean b) { if (a == b) return 1; return 2; }
    void e19(Boolean a, Boolean b) { if (a == b) { } x(); }
    void e20(Boolean a, Boolean b) { if (a != b) {} }
    void e21(Boolean a, Boolean b) { if (a == b || a == null) {} }
    void e22(Boolean a, Boolean b) { if (a == b) {} else { x(); } }
    void e23(Boolean a, Boolean b) { if (a == b) x(); else x(); }
    void e24(Boolean a, Boolean b) { while (a == b) { } }
    void e25(Boolean a, Boolean b) { for (int i = 0; a == b; i++) { break; } }
    void e26(Boolean a, Boolean b) { for (int i = 0; a == b; i++) { x(); } }
}
