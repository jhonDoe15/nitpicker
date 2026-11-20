package p;
import java.util.*;
public class M {
    X x; boolean c; int k; M other;
    @Nullable X nf; @Nullable static X sn; @Nullable volatile X vf; @Nullable int[] narr; @Nullable Integer nint; @Nullable Boolean nbool;
    @Nullable String nstr; @Nullable List<X> nlist; @Nullable E nenum;
    enum E { A, B }
    @Nullable E en() { return null; }
    static void sfoo() { }
    void ifoo() { }
    int m01() {
        return x
            .nul()
            .foo();
    }
    int m04() {
        X y = x.nul();
        y.foo();
        return y.foo();
    }
    int m05() {
        X y = x.nul();
        try {
            X.use(null);
        } finally {
            y.foo();
        }
        return 0;
    }
    int m06() {
        return x.nul()
            .f;
    }
    int m07() {
        X y =
            x.nul();
        int j = 0;
        return j
            + y.foo();
    }
    int m08() {
        if (x.nul().foo() > 0) { return 1; }
        return 0;
    }
    int m09() { return ((X) x.nul()).foo(); }
    int m10() { switch (en()) { case A: return 1; default: return 0; } }
    int m11() { try (AutoCloseable a = nclose()) { return 1; } catch (Exception e) { return 0; } }
    @Nullable AutoCloseable nclose() { return null; }
    int m12() { var y = x.nul(); return y.foo(); }
    int m13() { Integer i = nI(); i++; return i; }
    @Nullable Integer nI() { return null; }
    int m14() { int j = 0; j += nI(); return j; }
    <T> T ident(T t) { return t; }
    int m15() { return ident(x.nul()).foo(); }
    int m16() { Object o = new Object() { int z() { return x.nul().foo(); } }; return 0; }
    static int SI = new X().nul().foo();
    int inst = new X().nul().foo();
    M() { x.nul().foo(); }
    static { new X().nul().foo(); }
    int m17() { java.util.function.Supplier<Integer> s = () -> { X y = x.nul(); return y.foo(); }; return 0; }
    int m18() { return nstr() == null ? 0 : nstr().length(); }
    @Nullable String nstr() { return null; }
    int m19() { String s = nstr(); return s.isEmpty() ? 0 : 1; }
    int m20() { X y = x.nul(); return y.next.foo(); }
    int m21() { X y = x.nul(); Optional.of(y); List.of(y); return 0; }
    int f01() {
        return nf
            .foo();
    }
    int f02() { if (nf != null) { sfoo(); return nf.foo(); } return 0; }
    int f03() { if (nf != null) { X.use(this); return nf.foo(); } return 0; }
    int f04() { if (nf != null) { x.foo(); return nf.foo(); } return 0; }
    int f05() { if (nf != null) { ifoo(); return nf.foo(); } return 0; }
    int f06() { if (nf != null) { this.ifoo(); return nf.foo(); } return 0; }
    int f07() { if (nf != null) { other.ifoo(); return nf.foo(); } return 0; }
    int f08() { if (nf != null) { new X(); return nf.foo(); } return 0; }
    int f09() { if (nf != null) { nf.foo(); return nf.foo(); } return 0; }
    int f10() { if (nf != null) { x.next = x; return nf.foo(); } return 0; }
    int f11() { if (nf != null) { synchronized (this) { return nf.foo(); } } return 0; }
    int f12() { if (sn != null) { sfoo(); return sn.foo(); } return 0; }
    int f13() { if (sn != null) { ifoo(); return sn.foo(); } return 0; }
    int f14() { if (vf != null) { return vf.foo(); } return 0; }
    int f15() { if (nf == null) { return 0; } x.foo(); k++; return nf.foo(); }
    int f16() { if (other.nf != null) { sfoo(); return other.nf.foo(); } return 0; }
    int f18() { if (other.nf != null) { ifoo(); return other.nf.foo(); } return 0; }
    int f19(M o) { if (o.nf != null) { o = other; return o.nf.foo(); } return 0; }
    int f20() { return narr[0]; }
    int f21() { return narr.length; }
    int f22() { return nint + 1; }
    int f23() { if (nbool) return 1; return 0; }
    int f24() { switch (nstr) { case "a": return 1; default: return 0; } }
    int f25() { for (X e : nlist) { e.foo(); } return 0; }
    int f26() { switch (nenum) { case A: return 1; default: return 0; } }
    int f27() { X y; y = nf; return y.foo(); }
    int f28() { final X y = this.nf; return y.foo(); }
    int f29() { if (nf instanceof X) { return nf.foo(); } return 0; }
    int f30() { if (Objects.nonNull(nf)) { return nf.foo(); } return 0; }
    int f31() { return nf == null ? 0 : nf.foo(); }
    int f32() { while (nf != null) { nf.foo(); } return 0; }
    int f33() { return nf.foo() + nf.foo(); }
    int f34() {
        nf.foo();
        return nf.foo();
    }
    int f35() {
        X.use(nf.f);
        sfoo();
        return nf.foo();
    }
    int f36() {
        nf.foo();
        ifoo();
        return nf.foo();
    }
    int f37() { X y = nf; if (y == null) { return 0; } return nf.foo(); }
    int f38() { if (nf == null) { return 0; } X y = nf; ifoo(); return y.foo(); }
    int f39() { boolean b = nf != null; if (b) { return nf.foo(); } return 0; }
    int f40() { if (nf == null || c) { return 0; } return nf.foo(); }
    int f41() { if (nf != null && c) { return nf.foo(); } return nf.f; }
    int f42() { if (c) { if (nf == null) { return 0; } } return nf.foo(); }
    int f43() { Runnable r = new Runnable() { public void run() { nf.foo(); } }; return 0; }
    int f44() { return this.nstr.length() + M.sn.foo(); }
    int f45() { X.use(nf == null ? "a" : "b"); return nf.foo(); }
    int f46() { if (nf == null) { X.use(null); } else { X.use(null); } return nf.foo(); }
    int f47() { if (nf == null) { throw new IllegalStateException(); } other.ifoo(); x.foo(); return nf.foo(); }
    int f48() { nf = new X(); ifoo(); return nf.foo(); }
    int f49() { X y = nf; X.use(y); if (c) { return 0; } return nf.foo(); }
    int f50() { String s = "a" + nf; s += nstr; return s.length(); }
}
