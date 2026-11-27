package p;
import java.util.*;
public class A {
    static boolean a() { return true; }
    static boolean b(Object o) { return o != null; }
    Object o = new Object();
    boolean f1 = a() & b(o);
    boolean f2 = o != null & o.hashCode() > 1;
    { a(); if (o != null & o.hashCode() > 1) System.out.println(); }
    static { if (a() & b(null)) System.out.println(); }
    A() { if (a() & b(null)) System.out.println(); }
    A(int i) { this(); if (a() & b(null)) System.out.println(); }
    boolean g;
    void m1(boolean z) { g &= a(); }
    void m2(boolean[] z) { z[0] &= a(); }
    void m3(boolean z) { z &= a(); if (z) {} }
    void m4(boolean z) { z |= a(); if (z) {} }
    void m5(Boolean z) { if (z & a()) {} }
    Boolean m6(boolean z) { return z & a(); }
    boolean m7(Object x) { return (x != null) & x.hashCode() > 2; }
    int m8(Object x) { return (x != null & x.hashCode() > 2) ? 1 : 0; }
    void m9(Object x) { while (x != null & x.hashCode() > 2) { x = null; } }
    void m10(Object x) { do { x = null; } while (x != null & x.hashCode() > 2); }
    void m11(Object x) { for (int i=0; x != null & x.hashCode() > i; i++) { } }
    void m12(Object x) { assert x != null & x.hashCode() > 2; }
    void m13(Object x) { if (x instanceof String & x.hashCode() > 2) {} }
    void m14(int[] x, int i) { if (i > 0 & x[i] > 2) {} }
    void m15(int i, int j) { if (i > 0 & 10 / j > 2) {} }
    void m16(Object x) { boolean r = x != null & x.hashCode() > 2; }
    void m17(Object x) { boolean r = true; r = x != null & x.hashCode() > 2; }
    boolean m18(Object x) { return x != null ^ x.hashCode() > 2; }
    void m19(Object x) { if (x != null ^ x.hashCode() > 2) {} }
    void m20(Object x) { if (!(x != null & x.hashCode() > 2)) {} }
    void m21(Object x, Object y) { if (x != null & y != null & x.hashCode() > 2) {} }
    void m22(Object x, Object y) { if (x.hashCode() > 2 & y.hashCode() > 3 | a()) {} }
    void m23(Object x) { Runnable r = () -> { if (x != null & x.hashCode() > 2) {} }; }
    void m24(Object x) { new Object() { void q() { if (x != null & x.hashCode() > 2) {} } }; }
    void m25(Object x) { java.util.function.Supplier<Boolean> s = () -> x != null & x.hashCode() > 2; }
    void m26(Object x) { java.util.function.BooleanSupplier s = () -> x != null & x.hashCode() > 2; }
    void m27(Object x) { java.util.function.BooleanSupplier s = () -> { return a() & b(x); }; }
}
