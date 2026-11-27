package p;
public class H {
    static boolean a() { return true; }
    static boolean b(Object o) { return o != null; }
    void q1(Object x) { boolean q = x == null; if (b(x) & a()) {} }
    void q2(Object x) { boolean q = x == null; if (a() & b(x)) {} }
    void q3(Object x) { boolean q = x == null; if (a() & x.hashCode() > 1) {} }
    void q4(Object x) { boolean q = x == null; int k = 3; if (b(x) & a()) {} }
    void q5(Object x) { boolean q = x == null; if (q & a()) {} }
    void q6(Object x) { boolean q = x == null; boolean r = x == null; if (b(x) & a()) {} }
    void q7(Object x) { if (x == null) {} if (b(x) & a()) {} }
    void q8(Object x) { if (x == null || x.hashCode() > 2) {} if (b(x) & a()) {} }
    void q9(Object x) { boolean q = x == null; if (x.hashCode() > 4 & b(x)) {} }
    void q10(Object x) { boolean q = x == null; if (x.hashCode() > 4 & x.hashCode() > 5) {} }
    void q11(Object x) { boolean q = x == null; if (a() & a()) {} }
    void q12(Object x) { boolean q = x == null; boolean r = a(); if (a() & a()) {} }
    void q13(Object x) { int i = x == null ? 1 : 2; if (b(x) & a()) {} }
    void q15(Object x) { int i = x == null ? 0 : 7; if (b(x) & a()) {} }
    void q16(Object x) { int i = x == null ? 1 : a() ? 2 : 3; if (b(x) & a()) {} }
    void q17(Object x) { int i = a() ? 1 : 2; if (b(x) & a()) {} }
    void q18(Object x) { int i = x.hashCode() > 3 ? 1 : 2; if (a() & a()) {} }
    void q19(Object x) { int i = x != null ? 1 : 2; if (a() & a()) {} }
    void q20(Object x) { int i = x != null ? 1 : 2; if (x.hashCode()>1 & a()) {} }
    void q21(Object x) { int i = x != null ? 1 : 2; if (a() & x.hashCode()>1) {} }
    void q22(Object x) { int i = x != null ? 1 : 2; if (b(x) & x.hashCode()>1) {} }
}
