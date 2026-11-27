package p;
public class K {
    static boolean a() { return true; }
    static boolean b(Object o) { return o != null; }
    void r1(Object x) { if (x != null & b(x)) {} }
    void r2(Object x) { if (x != null & a()) {} }
    void r3(Object x) { if (x == null | a()) {} }
    void r4(Object x) { if (b(x) & x != null) {} }
    void r5(Object x) { if (x != null && a() & b(x)) {} }
    void r6(Object x) { if (x != null & x.hashCode() > 1 & a()) {} }
    void r7(Object x) { boolean q = x != null; if (a() & b(x)) {} }
    void r8(Object x) { boolean q = x != null; q = a(); if (a() & b(x)) {} }
    void r9(Object x) { boolean q = x != null; if (a() & b(x) | a()) {} }
    void r10(Object x) { boolean q = x != null; if (a() | b(x)) {} }
    void r11(Object x) { boolean q = x != null; if (a() | x.hashCode() > 1) {} }
    void r12(Object x, int[] z) { boolean q = x != null; if (a() & z[0] > 1) {} }
    void r13(Object x, int[] z) { boolean q = x != null; if (z[0] > 1 & a()) {} }
    void r14(Object x, int[] z) { boolean q = x != null; if (z[0] > 1 & z[1] > 3) {} }
    void r15(Object x, int[] z) { boolean q = x != null; boolean w = a(); if (z[0] > 1 & z[1] > 3) {} }
    void r16(Object x, int[] z) { boolean q = x != null; if (a()) {} if (a() & b(x)) {} }
    void r17(Object x, int[] z) { boolean q = x != null; String s = x.toString(); if (a() & b(x)) {} }
    void r18(Object x, int[] z) { boolean q = x != null; if (a() & !b(x)) {} }
}
