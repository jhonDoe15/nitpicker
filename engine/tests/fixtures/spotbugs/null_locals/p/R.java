package p;
import java.util.List;
public class R {
    X x; boolean c; @Nullable X nfield; List<X> xs;
    int r01() { return x.nul().foo(); }
    int r02() { X y = x.nul(); return y.foo(); }
    int r03() { X y = x.nul(); if (y != null) return y.foo(); return 0; }
    int r04() { X y = x.nul(); if (c) return 0; return y.foo(); }
    int r05() { X y = x.nul(); if (y == null) return 0; return y.foo(); }
    int r06() { X y = x.nul(); if (y == null) X.use(y); return y.foo(); }
    int r07() { X y = x.nul(); return y.f; }
    int r08() { X y = x.nul(); y.f = 3; return 0; }
    int r09() { return x.boxed(); }
    int r10() { return x.boxed() + 1; }
    int r11() { return x.arr()[0]; }
    int r12() { return x.arr().length; }
    int r13() { synchronized (x.nul()) { return 1; } }
    int r16() { X.derefMaybe(x.nul(), c); return 0; }
    int r17() { X.derefChecked(x.nul()); return 0; }
    int r19() { X.use(x.nul()); return 0; }
    String r20() { return "a" + x.nul(); }
    int r21() { return x.str().length(); }
    int r22() { for (X y : xs) { y.nul().foo(); } return 0; }
    int r23() { return X.snul().foo(); }
    int r24() { X y = x.nul(); X z = y; return z.foo(); }
    int r25() { return x.nul() != null ? x.nul().foo() : 0; }
    int r26() { if (x.nul() == null) return 0; return x.nul().foo(); }
    int r27() { X y = c ? x.nul() : x; return y.foo(); }
    int r28() { X y = x.nul(); y.foo(); return y.foo(); }
    int r29() { X y = x.nul(); if (y instanceof X) return y.foo(); return 0; }
    boolean r31() { return x.nul().equals(x); }
    boolean r32() { return x.equals(x.nul()); }
    int r33() { X y = x.nul(); while (c) { y.foo(); } return 0; }
    int r34() { X y = x.nul(); try { X.use(null); } catch (RuntimeException e) { return 0; } return y.foo(); }
    int r35() { X y = x.nul(); switch (y.f) { case 1: return 1; default: return 0; } }
    int r36() { X y; if (c) y = x.nul(); else y = x.plain(); return y.foo(); }
    int r37() { return x.plain().nul().nul().foo(); }
    int r38() { java.util.Objects.requireNonNull(x.nul()); return 0; }
    int r39() { X y = x.nul(); java.util.Objects.requireNonNull(y); return y.foo(); }
    int r40() { X y = x.nul(); assert y != null; return y.foo(); }
    int r41() { X y = x.nul(); if (y == null) throw new IllegalStateException(); return y.foo(); }
    int r42() { X y = x.nul(); if (y == null && c) return 0; return y.foo(); }
    int r43() { X y = x.nul(); if (y != null || c) return y.foo(); return 0; }
    int r44() { X y = x.nul(); if (y == null || y.f == 0) return 0; return y.foo(); }
    int r45() { X y = x.nul(); boolean b = y == null; if (b) return 0; return y.foo(); }
    int r46() { X y = (X) x.nul(); return y.foo(); }
    int r47() { Object y = x.nul(); return ((X) y).foo(); }
    int r48() { X y = x.nul(); X.use(y); return y.foo(); }
    int r49() { X y = x.nul(); x.foo(); return y.foo(); }
    int r50() { new X().callp(x); return 0; }
}
