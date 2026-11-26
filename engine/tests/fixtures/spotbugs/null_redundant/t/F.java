package t;
public class F {
    final Object ff; Object nf; static Object sf; final Object fn = null;
    F(Object a) { ff = a; }
    static void use(Object o) {}
    void other() {}
    void a1() { if (ff == null) { use(ff == null ? "a" : "b"); } }
    void a2() { if (nf == null) { use(nf == null ? "a" : "b"); } }
    void a3() { if (sf == null) { use(sf == null ? "a" : "b"); } }
    void a4() { if (ff != null) { use(ff == null ? "a" : "b"); } }
    void a5() { ff.hashCode(); use(ff == null ? "a" : "b"); }
    void a6() { nf.hashCode(); use(nf == null ? "a" : "b"); }
    void a7() { if (ff == null) { other(); use(ff == null ? "a" : "b"); } }
    void a8() { if (nf == null) { other(); use(nf == null ? "a" : "b"); } }
    void a9(F o) { if (o.ff == null) { use(o.ff == null ? "a" : "b"); } }
    void a10() { if (ff == null) { use(ff); } }
    void a11() { if (nf == null) { use(nf); } }
    void a12() { nf = new Object(); use(nf == null ? "a" : "b"); }
    void a13() { if (fn == null) use(""); }
    void a14() { if (ff == null) { if (ff == null) use(""); else use("x"); } }
}
