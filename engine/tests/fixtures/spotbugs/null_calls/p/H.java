package p;
public class H {
    X x; boolean c; int k; @Nullable X nf; @Nullable X ng; @Nullable static X sn; H other; @Nullable private X pn; @Nullable final X fn;
    H(@Nullable X a) { fn = a; }
    int h01() { X y = nf; return y.foo(); }
    int h02() { X y = nf; if (c) X.use(null); return y.foo(); }
    int h03() { X y = nf; if (c) return 0; return y.foo(); }
    int h04() { if (c) return 0; return nf.foo(); }
    int h05() { if (c) X.use(null); return nf.foo(); }
    int h06() { if (c) return nf.foo(); return 0; }
    int h07() { return c ? nf.foo() : 0; }
    int h08() { X.use(nf); return nf.foo(); }
    int h09() { if (nf != null) { X.use(null); return nf.foo(); } return 0; }
    int h10() { if (nf == null) { X.use(null); } return nf.foo(); }
    int h11() { if (nf != null) { ng = nf; return nf.foo(); } return 0; }
    int h12() { if (nf != null) { other.k = 3; return nf.foo(); } return 0; }
    int h13() { X.deref(nf); return 0; }
    int h14() { X y = nf; X.deref(y); return 0; }
    int h15() { return nf.f; }
    int h16() { nf.f = 3; return 0; }
    int h17() { synchronized (nf) { return 1; } }
    int h18() { return other.nf.foo(); }
    int h19() { H o = other; if (o.nf != null) return o.nf.foo(); return 0; }
    int h20() { if (other.nf != null) return other.nf.foo(); return 0; }
    int h21() { return pn.foo(); }
    int h22() { return fn.foo(); }
    int h23() { return nf.next.foo(); }
    int h24() { return nf.nf.foo(); }
    int h25() { while (c) { nf.foo(); } return 0; }
    int h26() { for (int i = 0; i < k; i++) { X y = nf; y.foo(); } return 0; }
    int h27() { X y = nf; X z = y; return z.foo(); }
    int h28() { return (nf != null ? nf : x).foo(); }
    int h29() { X y = nf != null ? nf : x; return y.foo(); }
    int h30() { nf = x; return nf.foo(); }
    int h31() { nf = x.plain(); return nf.foo(); }
    int h32() { nf = x.nul(); return nf.foo(); }
    int h33() { if (nf == null) { nf = new X(); } return nf.foo(); }
    int h34() { if (nf == null) { init(); } return nf.foo(); }
    void init() { nf = new X(); }
    int h35() { if (nf == null) return 0; init(); return nf.foo(); }
    int h36() { if (nf == null) return 0; return nf.foo() + nf.foo(); }
    int h37() { X.use(nf.foo()); return nf.foo(); }
    int h38() { if (nf != null && nf.foo() > 0) return nf.f; return 0; }
    int h39() { if (nf == null || nf.foo() > 0) return 0; return nf.f; }
    int h40() { assert nf != null; return nf.foo(); }
    int h41() { java.util.Objects.requireNonNull(nf); return nf.foo(); }
    boolean h42() { return nf.equals(x); }
    String h43() { return nf.toString() + "a" + nf; }
    int h44() { Runnable r = () -> nf.foo(); return 0; }
    int h45() { X y = sn; return y.foo(); }
    int h46() { X y = this.nf; int j = c ? 1 : 2; return y.foo(); }
    int h47() { X y = nf; try { X.use(null); } catch (RuntimeException e) { return 0; } return y.foo(); }
    int h48() { X y = c ? nf : x; return y.foo(); }
}
