package p;
public class L {
    X x; boolean c;
    int l01() { X y = null; return y.foo(); }
    int l02() { X y = null; if (c) y = new X(); return y.foo(); }
    int l03(X y) { if (y == null) X.use(null); return y.foo(); }
    int l04(X y) { y.foo(); if (y == null) return 1; return 0; }
    int l05(X y) { if (y == null) { X.use(y); } return 0; }
    int l06(X y) { if (y != null) return 1; return y.foo(); }
    int l07(X y) { X z = new X(); if (z == null) return 1; return 0; }
    int l08(X y) { if (y == null) { if (y == null) return 1; } return 0; }
    int l09(X y) { if (y == null) { return y.foo(); } return 0; }
    int l10(X y) { X z = null; if (c) z = y; if (c) return z.foo(); return 0; }
    int l11(X y) { X z = null; try { z = new X(); X.use(z); } catch (RuntimeException e) { X.use(e); } return z.foo(); }
    int l12(X y) { X z = null; for (int i = 0; i < 3; i++) { z = new X(); } return z.foo(); }
    int l13(X y) { X z = null; while (c) { z = new X(); } return z.foo(); }
    int l14(X y) { X z = y == null ? null : y.next; return z.foo(); }
    int l15(X y) { X z = null; switch (y.f) { case 1: z = y; break; case 2: z = y.next; break; } return z.foo(); }
    int l16(X y) { X z = null; switch (y.f) { case 1: z = y; break; default: z = y.next; break; } return z.foo(); }
    int l17(X y) { X z = null; X.deref(z); return 0; }
    int l18(X y) { X.deref(null); return 0; }
    int l19(X y) { X z = c ? null : y; X.deref(z); return 0; }
    int l20(X y) { if (y == null) { X.use(null); } X.deref(y); return 0; }
    int l21(X y) { X z = null; if (c) { z = y; } X.use(null); if (c) { X.use(null); } return z.foo(); }
    int l22(X y) { X z = null; if (c) { X.use(null); } else { z = y; } return z.foo(); }
    int l23(X y) { X z = null; if (y.f > 0) { z = y; } if (y.f > 1) { return z.foo(); } return 0; }
    int l24(X y) { boolean n = y == null; X.use(null); return y.foo(); }
    int l25(X y) { if (y == null) { System.out.println("x"); } return y.f; }
    int l26(X y) { if (y != null) { X.use(null); } return y.foo(); }
    int l27(X y) { if (y == null) { X.use(null); } else { X.use(y); } X.use(null); return y.foo(); }
    int l29(X y) { if (y == null) c = true; if (c) return 0; return y.foo(); }
    int l31(X y) { Object o = null; return o.hashCode(); }
    int l32(X y) { X z = null; if (c) z = y; return z.f; }
    int l33(X y) { int[] a = null; if (c) a = new int[1]; return a[0] + a.length; }
    int l34(X y) { String s = null; if (c) s = "a"; return s.length(); }
    int l35(X y) { Integer i = null; if (c) i = 1; return i; }
    Boolean l36(X y) { return null; }
    Boolean l37(X y) { if (c) return null; return true; }
}
