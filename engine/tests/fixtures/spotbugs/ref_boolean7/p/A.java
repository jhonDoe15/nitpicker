package p;
import java.util.function.*;
public class A {
    static final Boolean K1 = Boolean.TRUE;
    Boolean f;
    static Boolean g() { return null; }
    boolean d1(Boolean a) { return g() == K1; }
    boolean d2(Boolean a) { return K1 == g(); }
    boolean d3(Boolean a) { return f == K1; }
    boolean d4(Boolean a) { return K1 == f; }
    boolean d5(Boolean a) { Boolean l = K1; return l == a; }
    boolean d6(Boolean a) { Boolean l = K1; return a == l; }
    boolean d7(Boolean a) { Boolean l = K1; return l == f; }
    boolean d8(Boolean a) { Boolean l = Boolean.TRUE; return l == a; }
    boolean d9(Boolean a) { Boolean l = Boolean.valueOf(a); return l == a; }
    boolean d10(Boolean a) { Boolean l = g(); return l == a; }
    boolean d11(Boolean a) { Boolean l = g(); return a == l; }
    boolean d12(Boolean a) { Boolean l = f; return a == l; }
    boolean d13(Boolean a) { Boolean l = f; return l == f; }
    boolean d14(Boolean a) { Boolean l = null; return a == l; }
    boolean d15(Boolean a) { Boolean l = null; l = a; return a == l; }
    boolean d16(Boolean a, boolean c) { Boolean l = c ? a : f; return a == l; }
    boolean d17(Boolean a, boolean c) { Boolean l = c ? Boolean.TRUE : f; return a == l; }
    boolean d18(Boolean a) { return a == (f); }
    boolean d19(Boolean a) { return a == (Boolean) f; }
    boolean d20(Boolean a) { return a == (Object) f; }
    boolean d21(Object a) { return a == (Object) f; }
    boolean d22(Object a, Boolean b) { return (Object) b == a; }
    boolean d23(Boolean a) { return a == (Serializable_()) ; }
    static java.io.Serializable Serializable_() { return null; }
    boolean d24(Boolean a, java.io.Serializable s) { return s == (java.io.Serializable) a; }
    boolean d25(Boolean a, Boolean b) { return (a) == (b); }
    boolean d26(Boolean a, Boolean b) { return !(a == b); }
    boolean d27(Boolean a, Boolean b) { return a == b == true; }
    boolean d28(Boolean a, Boolean b, Boolean c) { return (a == b) == c; }
    boolean d29(Boolean a, Boolean b, Boolean c) { return a == b == c; }
}
