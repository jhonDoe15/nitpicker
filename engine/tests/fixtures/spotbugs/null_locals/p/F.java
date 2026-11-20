package p;
public class F {
    X x; boolean c; @Nullable X nfield; @Nullable static X sn; X plain = null; @Nullable final X fin = null;
    int f01() { return nfield.foo(); }
    int f02() { return this.nfield.foo(); }
    int f03() { if (nfield != null) return nfield.foo(); return 0; }
    int f04() { X y = nfield; return y.foo(); }
    int f05() { nfield = new X(); return nfield.foo(); }
    int f06() { return x.nf.foo(); }
    int f07() { if (x.nf != null) return x.nf.foo(); return 0; }
    int f08() { return sn.foo(); }
    int f09() { if (nfield == null) return 0; X.use(null); return nfield.foo(); }
    int f10() { X.deref(nfield); return 0; }
    int f11() { return fin.foo(); }
    int f12() { nfield = x; return nfield.foo(); }
    int f13(F o) { return o.nfield.foo(); }
    int f14(F o) { if (o.nfield != null) return o.nfield.foo(); return 0; }
    int f15() { if (nfield == null) { X.use(nfield); } return 0; }
    int f16() { nfield = null; return nfield.foo(); }
    int f17() { return plain.foo(); }
    int p01(@Nullable X y) { return y.foo(); }
    int p02(@Nullable X y) { if (y != null) return y.foo(); return 0; }
    int p03(@Nullable X y) { if (c) return 0; return y.foo(); }
    int p04(@Nullable X y) { X.deref(y); return 0; }
    int p05(@Nullable X y) { X z = y; return z.foo(); }
    int p06(@Nullable X y) { y = new X(); return y.foo(); }
    static int p07(@Nullable X y) { return y.foo(); }
    private int p08(@Nullable X y) { return y.foo(); }
    int p09(@Nullable X y) { if (c) { return y.foo(); } return 0; }
    int p10(@Nullable Integer y) { return y; }
}
