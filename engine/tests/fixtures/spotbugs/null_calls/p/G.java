package p;
import java.util.*;
public class G {
    X x; Y yy; I ii; boolean c; int k; List<X> xs; Map<String, X> map;
    @Nullable List<X> nlist() { return null; }
    @Nullable String nstr() { return null; }
    @Nullable Runnable nrun() { return null; }
    @Nullable X[] narr() { return null; }
    @Nullable Boolean nbool() { return null; }
    @Nullable RuntimeException nex() { return null; }
    int g01() { X y = x.nul(); int j = c ? 1 : 2; return y.foo() + j; }
    int g02() { X y = x.nul(); if (c) { X.use(null); } return y.foo(); }
    int g03() { X y = x.nul(); if (c) { X.use(null); } else { X.use(y); } return y.foo(); }
    int g04() { X y = x.nul(); for (int i = 0; i < 3; i++) { X.use(null); } return y.foo(); }
    int g05() { X y = x.nul(); for (int i = 0; i < 3; i++) { y.foo(); } return 0; }
    int g06() { X y = x.nul(); do { y.foo(); } while (c); return 0; }
    int g07() { X y = x.nul(); try { X.use(null); } finally { X.use(null); } return y.foo(); }
    int g08() { X y = x.nul(); try { return y.foo(); } finally { X.use(null); } }
    int g09() { X y = x.nul(); try { X.use(null); } catch (RuntimeException e) { X.use(e); } return y.foo(); }
    int g10() { X y = x.nul(); if (c) throw new IllegalStateException(); return y.foo(); }
    int g11() { X y = x.nul(); if (c) { return y.foo(); } else { return y.f; } }
    int g12() { X y = x.nul(); switch (k) { case 1: X.use(null); break; default: X.use(y); } return y.foo(); }
    int g13() { X y = x.nul(); switch (k) { case 1: return 1; default: X.use(y); } return y.foo(); }
    int g14() { X y = x.nul(); boolean b = k > 3 && c; return y.foo(); }
    int g15() { X y = x.nul(); X.use(k > 3); return y.foo(); }
    int g16() { for (X y : nlist()) { y.foo(); } return 0; }
    int g17() { switch (nstr()) { case "a": return 1; default: return 0; } }
    int g18() { nrun().run(); return 0; }
    int g19() { Runnable r = nrun()::run; return 0; }
    int g20() { for (X y : narr()) { y.foo(); } return 0; }
    int g21() { if (nbool()) return 1; return 0; }
    int g22() { throw nex(); }
    int g23() { Runnable r = () -> x.nul().foo(); return 0; }
    int g24() { return yy.nul().foo(); }
    int g25() { return yy.onul().foo(); }
    int g26() { return ii.inul().foo(); }
    int g27() { return x.inul().foo(); }
    int g28() { return ii.dnul().foo(); }
    int g29() { return x.dnul().foo(); }
    int g30() { X y = x.nul(); y = x; return y.foo(); }
    int g31() { X y = x.nul(); X.use(y == null); return y.foo(); }
    int g32() { X y = x.nul(); return y == null ? 0 : y.foo(); }
    int g33() { X y = x.nul(); if (y == x) return y.foo(); return 0; }
    int g34() { X y = x.nul(); if (y.equals(x)) return y.foo(); return 0; }
    int g35() { return map.get("a").foo(); }
    int g36() { X y = x.nul(); k = 3; this.c = true; return y.foo(); }
    int g37() { X y = x.nul(); while (c) { X.use(null); } return y.foo(); }
    int g38() { X y = x.nul(); return c ? y.foo() : y.f; }
    int g39() { X y = x.nul(); return c && y.foo() > 0 ? 1 : 0; }
    int g40() { X y = x.nul(); return y.foo() > 0 && c ? 1 : 0; }
    int d04() { X.dLoop(x.nul()); return 0; }
    int d05() { X.dWhile(x.nul(), c); return 0; }
    int d08() { X.dThrow(x.nul(), c); return 0; }
    int d09() { X.dReassign(x.nul()); return 0; }
    int d13() { X.dCheckThenDeref(x.nul()); return 0; }
    int d15() { x.virt(x.nul()); return 0; }
    int d17() { yy.virt(x.nul()); return 0; }
    int d19() { x.viaLambda(x.nul()); return 0; }
    int d21() { X.dAssert(x.nul()); return 0; }
    int d27() { xs.addAll(nlist()); return 0; }
    int d30() { Objects.requireNonNull(nstr(), "m"); return nstr().length(); }
}
