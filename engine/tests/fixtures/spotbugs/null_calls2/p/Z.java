package p;
public class Z {
    @Nullable static X get(int i) { return null; }
    static X get(String s) { return new X(); }
    static int o1() { return get("a").foo(); }
    static int o2() { return get(1).foo(); }
    static void a(X x, boolean c) { b(x, c); }
    static void b(X x, boolean c) { if (c) a(x, false); x.foo(); }
    static void userA(X y) { a(y.nul(), true); }
    static void userB(X y) { b(y.nul(), true); }
    int ctl(X y, boolean c) { X x = y.nul(); if (c) { x.foo(); } return 0; }
    int inf(X y, boolean c) { X x = y.nul(); if (c) { x.foo(); } while (true) { c = !c; } }
    int inf2(X y, boolean c) { X x = y.nul(); while (true) { c = !c; } }
    int inf3(X y, boolean c) { X x = y.nul(); if (c) { x.foo(); } throw new IllegalStateException(); }
    static void m0(X x) { m1(x); }
    static void m1(X x) { m2(x); }
    static void m2(X x) { m3(x); }
    static void m3(X x) { m4(x); }
    static void m4(X x) { m5(x); }
    static void m5(X x) { m6(x); }
    static void m6(X x) { m7(x); }
    static void m7(X x) { m8(x); }
    static void m8(X x) { m9(x); }
    static void m9(X x) { m10(x); }
    static void m10(X x) { m11(x); }
    static void m11(X x) { m12(x); }
    static void m12(X x) { m13(x); }
    static void m13(X x) { m14(x); }
    static void m14(X x) { m15(x); }
    static void m15(X x) { m16(x); }
    static void m16(X x) { m17(x); }
    static void m17(X x) { m18(x); }
    static void m18(X x) { m19(x); }
    static void m19(X x) { m20(x); }
    static void m20(X x) { m21(x); }
    static void m21(X x) { m22(x); }
    static void m22(X x) { m23(x); }
    static void m23(X x) { m24(x); }
    static void m24(X x) { m25(x); }
    static void m25(X x) { m26(x); }
    static void m26(X x) { m27(x); }
    static void m27(X x) { m28(x); }
    static void m28(X x) { m29(x); }
    static void m29(X x) { x.foo(); }
    static void u0(X y) { m0(y.nul()); }
    static void u5(X y) { m5(y.nul()); }
    static void u20(X y) { m20(y.nul()); }
    static void u26(X y) { m26(y.nul()); }
}
