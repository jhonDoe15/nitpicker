package p;
public class N {
    static boolean a() { return true; }
    static boolean b(Object o) { return o != null; }
    void s1(boolean z, Object x) { if ((z & b(x)) & a()) {} }
    void s2(boolean z, Object x) { if ((a() & b(x)) & z) {} }
    void s3(boolean z, Object x) { if (z & (a() ? b(x) : false)) {} }
    void s4(boolean z, Object x) { if (a() & (z ? b(x) : false)) {} }
    void s5(boolean z, Object x) { if (a() & (z ? true : false)) {} }
    void s6(boolean z, Object x) { if (a() & (b(x) ? true : false)) {} }
    void s7(boolean z, Object x) { if (a() & (z ? a() : b(x))) {} }
    void s8(boolean z, Object x, int k) { if (z && (a() ? a() & b(x) : false)) {} }
    void s9(boolean z, Object x, int k) { if (!(a() ? a() & b(x) : false)) {} }
    void s10(boolean z, Object x, int k) { boolean r = z | (a() ? true : false); }
    boolean s11(boolean z, Object x, int k) { return a() ? a() & b(x) : false; }
    boolean s12(boolean z, Object x, int k) { return switch (k) { case 1 -> a() & b(x); default -> false; }; }
    void s13(boolean z, Object x, int k) { if (a() & Boolean.TRUE) {} }
    void s14(boolean z, Object x, int k) { Boolean B = a(); if (B & b(x)) {} }
    void s15(boolean z, Object x, int k) { Boolean B = a(); if (b(x) & B) {} }
    void s16(boolean z, Object x, int k) { Boolean B = a(); if (B & B) {} }
    void s17(boolean z, Object x, int k) { Boolean B = a(); if (z & B) {} }
    void s18(boolean z, Object x, int k) { Boolean B = a(); if (B & z) {} }
    void s19(boolean z, Object x, int k) { Boolean B = a(); if (B | b(x)) {} }
    void s20(boolean z, Object x, int k) { Boolean B = a(); if (B ^ b(x)) {} }
}
