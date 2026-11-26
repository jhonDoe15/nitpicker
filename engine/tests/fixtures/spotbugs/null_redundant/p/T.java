package p;
import java.util.Objects;
public class T {
    static void use(Object o) {}
    void c1(Object x) { x.hashCode(); if (x == null) throw new IllegalStateException(); }
    void c2(Object x) { if (x == null) return; if (x == null) throw new IllegalStateException(); }
    void c3() { Object x = null; if (x != null) throw new IllegalStateException(); }
    void c4(Object x) { x.hashCode(); if (x == null) return; use(x); }
    void c5(Object x) { x.hashCode(); if (x != null) { use(x); } else { use(""); } }
    void c6(Object x) { x.hashCode(); if (Objects.isNull(x)) use(""); }
    void c7(Object x) { x.hashCode(); if (Objects.nonNull(x)) use(x); }
    void c8(Object x) { x.hashCode(); use(x != null ? "a" : "b"); }
    void c9(Object x) { x.hashCode(); if (x != null && x.hashCode() > 2) use(x); }
    void c10(Object x) { x.hashCode(); if (x == null || x.hashCode() > 2) use(x); }
    void c11(Object x, Object y) { if (x == null) { use(x); use(y); } if (y == null) { use(y); } }
    void c12(Object x, Object y) { if (x == null) use(x); if (y == null) use(y); }
    void c13(Object x) { x.hashCode(); if (x == null) { use(""); return; } use(x); }
    void c14(Object x) { for (int i = 0; i < 3; i++) { x.hashCode(); if (x != null) use(x); } }
    void c15(Object x) { x.hashCode(); x = null; if (x == null) use(""); }
    void c16(Object x) { x.hashCode(); if (x == null) { use(""); } use(x); }
    void c17(String x) { int n = x.length(); if (x == null) use(""); use(n); }
    void c18(Object x) { if (x instanceof String) { if (x == null) use(""); } }
    void c19(Object x) { Object y = x; if (y != null) use(y); }
    void c20() { Object x = new Object(); if (x == null) { use(""); } else { use(x); } }
    void c21(Object x) { x.hashCode(); while (x != null) { use(x); x = null; } }
    void c22() { Object x = new Object(); if (x != null) { use(x); } else { use(""); } }
    Object c23() { Object x = new Object(); return x != null ? x : ""; }
    void c24(Object x) { if (x == null) { return; } x.hashCode(); if (x != null) use(x); }
}
