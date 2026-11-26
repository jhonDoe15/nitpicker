package p;
public class K {
    Object f; static Object sf;
    static void use(Object o) {}
    static String s(Object o) { return "" + o; }
    void a1(Object x) { if (x == null) use(x); }
    void a2(Object x) { if (x == null) { use(x); use(x); } }
    void a3(Object x) { if (x == null) { String m = "a" + x; use(m); } }
    void a4() { Object x = null; use(x); }
    void a5(Object x) { if (x != null) return; use(x); }
    void a6() { if (f == null) use(f); }
    void a7() { if (sf == null) use(sf); }
    void a8(Object x) { if (x == null) { x = new Object(); use(x); } }
    void a9(Object x) { if (x == null) { Object y = x; use(y); } }
    Object a10(Object x) { if (x == null) return x; return null; }
    void a11(Object x) { if (x == null) throw new IllegalStateException("x " + x); }
    void a12(Object x) { if (x == null) { assert x != null; } }
    void a13(Object x) { if (x == null) { if (x == null) use(""); } }
    void a14(Object x) { if (x == null) { use(x);
        use(x); } }
    void a15(Object x, Object y) { if (x == null && y == null) use(x); }
    void a16(Object x) { boolean b = x == null; if (b) use(x); }
    void a17(Object x) { if (x == null) { Object[] arr = { x }; use(arr); } }
    void a18(Object x) { if (x == null) { use(x == null ? "n" : "m"); } }
    void a19(Object x) { if (java.util.Objects.isNull(x)) use(x); }
    void a20(Object x) { if (!(x != null)) use(x); }
    Object a21(Object x) { return x == null ? x : "y"; }
    void a22(Object x) { if (x == null) { synchronized (this) { use(x); } } }
    void a23(String x) { if (x == null) { use(String.valueOf(x)); } }
    void a24(Object x) { while (x == null) { use(x); x = new Object(); } }
    void a25(Object x) { if (x == null) { Runnable r = () -> use(x); r.run(); } }
}
