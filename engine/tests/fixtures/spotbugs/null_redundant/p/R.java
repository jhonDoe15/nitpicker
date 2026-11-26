package p;
public class R {
    Object f = new Object(); final Object ff = new Object();
    static void use(Object o) {}
    void b1() { Object x = new Object(); if (x != null) use(x); }
    void b2() { Object x = new Object(); if (x == null) use(""); }
    void b3() { String x = "a"; if (x != null) use(x); }
    void b4(Object x) { x.hashCode(); if (x != null) use(x); }
    void b5(Object x) { x.hashCode(); if (x == null) use(""); }
    void b6() { Object x = null; if (x == null) use(""); }
    void b7() { Object x = null; if (x != null) use(x); }
    void b8() { if (ff != null) use(""); }
    void b9() { Object x = f; x.hashCode(); if (x != null) use(x); }
    void b10(String s) { String t = s.trim(); if (t != null) use(t); }
    void b11(Object x) { if (x == null) return; if (x != null) use(x); }
    void b12(Object x) { if (x != null) { if (x != null) use(x); } }
    void b13() { StringBuilder sb = new StringBuilder(); if (sb != null) use(sb); }
    void b14(Object[] a) { int n = a.length; if (a != null) use(n); }
    void b15(Object x) { synchronized (x) { if (x != null) use(x); } }
    void b16() { Object x = new Object(); assert x != null; }
    void b17(Object x) { if (x instanceof String) { if (x != null) use(x); } }
    void b18(Object x) { x.hashCode();
        if (x != null)
            use(x); }
    void b19() { Object x = this; if (x != null) use(x); }
    void b20(int[] a) { a[0] = 1; if (a == null) use(""); }
    void b21() { Object x = new Object(); boolean z = x != null; use(z); }
    void b22() { Object x = new Object(); use(x == null ? "a" : "b"); }
    void b23(Object x) { java.util.Objects.requireNonNull(x); if (x != null) use(x); }
    void b24(Object x) { if (x == null) throw new IllegalStateException(); if (x == null) use(""); }
    void b25() { Object x = new Object(); if (x == null) throw new IllegalStateException(); }
}
