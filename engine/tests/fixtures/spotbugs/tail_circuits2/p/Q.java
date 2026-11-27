package p;

public class Q {
    int f; boolean b, c, g;
    boolean check() { return f > 0; }
    void use(boolean v) { }
    boolean E1_and_ret(Object x, int[] a, int i) { return x != null & x.hashCode() > 0; }
    boolean E1_and_iff(Object x, int[] a, int i) { if (x != null & x.hashCode() > 0) return true; return false; }
    boolean E1_and_whl(Object x, int[] a, int i) { while (x != null & x.hashCode() > 0) { f++; } return true; }
    boolean E1_and_loc(Object x, int[] a, int i) { boolean r = x != null & x.hashCode() > 0; return r; }
    boolean E1_and_fld(Object x, int[] a, int i) { g = x != null & x.hashCode() > 0; return true; }
    boolean E1_and_arg(Object x, int[] a, int i) { use(x != null & x.hashCode() > 0); return true; }
    boolean E1_and_ter(Object x, int[] a, int i) { return (x != null & x.hashCode() > 0) ? true : false; }
    boolean E1_and_neg(Object x, int[] a, int i) { return !(x != null & x.hashCode() > 0); }
    boolean E1_and_asr(Object x, int[] a, int i) { assert x != null & x.hashCode() > 0; return true; }
    boolean E1_or_ret(Object x, int[] a, int i) { return x == null | x.hashCode() > 0; }
    boolean E1_or_iff(Object x, int[] a, int i) { if (x == null | x.hashCode() > 0) return true; return false; }
    boolean E1_or_loc(Object x, int[] a, int i) { boolean r = x == null | x.hashCode() > 0; return r; }
    boolean E1_or_fld(Object x, int[] a, int i) { g = x == null | x.hashCode() > 0; return true; }
    boolean E1_or_arg(Object x, int[] a, int i) { use(x == null | x.hashCode() > 0); return true; }
    boolean E1_or_ter(Object x, int[] a, int i) { return (x == null | x.hashCode() > 0) ? true : false; }
    boolean E1_or_neg(Object x, int[] a, int i) { return !(x == null | x.hashCode() > 0); }
    boolean E1_or_asr(Object x, int[] a, int i) { assert x == null | x.hashCode() > 0; return true; }
    boolean E2_and_ret(Object x, int[] a, int i) { return x != null & b; }
    boolean E2_and_iff(Object x, int[] a, int i) { if (x != null & b) return true; return false; }
    boolean E2_and_whl(Object x, int[] a, int i) { while (x != null & b) { f++; } return true; }
    boolean E2_and_loc(Object x, int[] a, int i) { boolean r = x != null & b; return r; }
    boolean E2_and_fld(Object x, int[] a, int i) { g = x != null & b; return true; }
    boolean E2_and_arg(Object x, int[] a, int i) { use(x != null & b); return true; }
    boolean E2_and_ter(Object x, int[] a, int i) { return (x != null & b) ? true : false; }
    boolean E2_and_neg(Object x, int[] a, int i) { return !(x != null & b); }
    boolean E2_and_asr(Object x, int[] a, int i) { assert x != null & b; return true; }
    boolean E2_or_ret(Object x, int[] a, int i) { return x == null | b; }
    boolean E2_or_iff(Object x, int[] a, int i) { if (x == null | b) return true; return false; }
    boolean E2_or_whl(Object x, int[] a, int i) { while (x == null | b) { f++; } return true; }
    boolean E2_or_loc(Object x, int[] a, int i) { boolean r = x == null | b; return r; }
    boolean E2_or_fld(Object x, int[] a, int i) { g = x == null | b; return true; }
    boolean E2_or_arg(Object x, int[] a, int i) { use(x == null | b); return true; }
    boolean E2_or_ter(Object x, int[] a, int i) { return (x == null | b) ? true : false; }
    boolean E2_or_neg(Object x, int[] a, int i) { return !(x == null | b); }
    boolean E2_or_asr(Object x, int[] a, int i) { assert x == null | b; return true; }
    boolean E3_and_ret(Object x, int[] a, int i) { return b & check(); }
    boolean E3_and_iff(Object x, int[] a, int i) { if (b & check()) return true; return false; }
    boolean E3_and_whl(Object x, int[] a, int i) { while (b & check()) { f++; } return true; }
    boolean E3_and_loc(Object x, int[] a, int i) { boolean r = b & check(); return r; }
    boolean E3_and_fld(Object x, int[] a, int i) { g = b & check(); return true; }
    boolean E3_and_arg(Object x, int[] a, int i) { use(b & check()); return true; }
    boolean E3_and_ter(Object x, int[] a, int i) { return (b & check()) ? true : false; }
    boolean E3_and_neg(Object x, int[] a, int i) { return !(b & check()); }
    boolean E3_and_asr(Object x, int[] a, int i) { assert b & check(); return true; }
    boolean E3_or_ret(Object x, int[] a, int i) { return b | check(); }
    boolean E3_or_iff(Object x, int[] a, int i) { if (b | check()) return true; return false; }
    boolean E3_or_whl(Object x, int[] a, int i) { while (b | check()) { f++; } return true; }
    boolean E3_or_loc(Object x, int[] a, int i) { boolean r = b | check(); return r; }
    boolean E3_or_fld(Object x, int[] a, int i) { g = b | check(); return true; }
    boolean E3_or_arg(Object x, int[] a, int i) { use(b | check()); return true; }
    boolean E3_or_ter(Object x, int[] a, int i) { return (b | check()) ? true : false; }
    boolean E3_or_neg(Object x, int[] a, int i) { return !(b | check()); }
    boolean E3_or_asr(Object x, int[] a, int i) { assert b | check(); return true; }
    boolean E4_and_ret(Object x, int[] a, int i) { return a.length > 0 & a[0] > 0; }
    boolean E4_and_iff(Object x, int[] a, int i) { if (a.length > 0 & a[0] > 0) return true; return false; }
    boolean E4_and_whl(Object x, int[] a, int i) { while (a.length > 0 & a[0] > 0) { f++; } return true; }
    boolean E4_and_loc(Object x, int[] a, int i) { boolean r = a.length > 0 & a[0] > 0; return r; }
    boolean E4_and_fld(Object x, int[] a, int i) { g = a.length > 0 & a[0] > 0; return true; }
    boolean E4_and_arg(Object x, int[] a, int i) { use(a.length > 0 & a[0] > 0); return true; }
    boolean E4_and_ter(Object x, int[] a, int i) { return (a.length > 0 & a[0] > 0) ? true : false; }
    boolean E4_and_neg(Object x, int[] a, int i) { return !(a.length > 0 & a[0] > 0); }
    boolean E4_and_asr(Object x, int[] a, int i) { assert a.length > 0 & a[0] > 0; return true; }
    boolean E4_or_ret(Object x, int[] a, int i) { return a.length > 0 | a[0] > 0; }
    boolean E4_or_iff(Object x, int[] a, int i) { if (a.length > 0 | a[0] > 0) return true; return false; }
    boolean E4_or_whl(Object x, int[] a, int i) { while (a.length > 0 | a[0] > 0) { f++; } return true; }
    boolean E4_or_loc(Object x, int[] a, int i) { boolean r = a.length > 0 | a[0] > 0; return r; }
    boolean E4_or_fld(Object x, int[] a, int i) { g = a.length > 0 | a[0] > 0; return true; }
    boolean E4_or_arg(Object x, int[] a, int i) { use(a.length > 0 | a[0] > 0); return true; }
    boolean E4_or_ter(Object x, int[] a, int i) { return (a.length > 0 | a[0] > 0) ? true : false; }
    boolean E4_or_neg(Object x, int[] a, int i) { return !(a.length > 0 | a[0] > 0); }
    boolean E4_or_asr(Object x, int[] a, int i) { assert a.length > 0 | a[0] > 0; return true; }
    boolean E5_and_ret(Object x, int[] a, int i) { return x instanceof String & x.hashCode() > 0; }
    boolean E5_and_iff(Object x, int[] a, int i) { if (x instanceof String & x.hashCode() > 0) return true; return false; }
    boolean E5_and_whl(Object x, int[] a, int i) { while (x instanceof String & x.hashCode() > 0) { f++; } return true; }
    boolean E5_and_loc(Object x, int[] a, int i) { boolean r = x instanceof String & x.hashCode() > 0; return r; }
    boolean E5_and_fld(Object x, int[] a, int i) { g = x instanceof String & x.hashCode() > 0; return true; }
    boolean E5_and_arg(Object x, int[] a, int i) { use(x instanceof String & x.hashCode() > 0); return true; }
    boolean E5_and_ter(Object x, int[] a, int i) { return (x instanceof String & x.hashCode() > 0) ? true : false; }
    boolean E5_and_neg(Object x, int[] a, int i) { return !(x instanceof String & x.hashCode() > 0); }
    boolean E5_and_asr(Object x, int[] a, int i) { assert x instanceof String & x.hashCode() > 0; return true; }
    boolean E5_or_ret(Object x, int[] a, int i) { return x instanceof String | x.hashCode() > 0; }
    boolean E5_or_iff(Object x, int[] a, int i) { if (x instanceof String | x.hashCode() > 0) return true; return false; }
    boolean E5_or_whl(Object x, int[] a, int i) { while (x instanceof String | x.hashCode() > 0) { f++; } return true; }
    boolean E5_or_loc(Object x, int[] a, int i) { boolean r = x instanceof String | x.hashCode() > 0; return r; }
    boolean E5_or_fld(Object x, int[] a, int i) { g = x instanceof String | x.hashCode() > 0; return true; }
    boolean E5_or_arg(Object x, int[] a, int i) { use(x instanceof String | x.hashCode() > 0); return true; }
    boolean E5_or_ter(Object x, int[] a, int i) { return (x instanceof String | x.hashCode() > 0) ? true : false; }
    boolean E5_or_neg(Object x, int[] a, int i) { return !(x instanceof String | x.hashCode() > 0); }
    boolean E5_or_asr(Object x, int[] a, int i) { assert x instanceof String | x.hashCode() > 0; return true; }
    boolean E6_and_ret(Object x, int[] a, int i) { return b & !c; }
    boolean E6_and_iff(Object x, int[] a, int i) { if (b & !c) return true; return false; }
    boolean E6_and_whl(Object x, int[] a, int i) { while (b & !c) { f++; } return true; }
    boolean E6_and_loc(Object x, int[] a, int i) { boolean r = b & !c; return r; }
    boolean E6_and_fld(Object x, int[] a, int i) { g = b & !c; return true; }
    boolean E6_and_arg(Object x, int[] a, int i) { use(b & !c); return true; }
    boolean E6_and_ter(Object x, int[] a, int i) { return (b & !c) ? true : false; }
    boolean E6_and_neg(Object x, int[] a, int i) { return !(b & !c); }
    boolean E6_and_asr(Object x, int[] a, int i) { assert b & !c; return true; }
    boolean E6_or_ret(Object x, int[] a, int i) { return b | !c; }
    boolean E6_or_iff(Object x, int[] a, int i) { if (b | !c) return true; return false; }
    boolean E6_or_whl(Object x, int[] a, int i) { while (b | !c) { f++; } return true; }
    boolean E6_or_loc(Object x, int[] a, int i) { boolean r = b | !c; return r; }
    boolean E6_or_fld(Object x, int[] a, int i) { g = b | !c; return true; }
    boolean E6_or_arg(Object x, int[] a, int i) { use(b | !c); return true; }
    boolean E6_or_ter(Object x, int[] a, int i) { return (b | !c) ? true : false; }
    boolean E6_or_neg(Object x, int[] a, int i) { return !(b | !c); }
    boolean E6_or_asr(Object x, int[] a, int i) { assert b | !c; return true; }
    boolean E7_and_ret(Object x, int[] a, int i) { return i > 0 & 10 / i > 0; }
    boolean E7_and_iff(Object x, int[] a, int i) { if (i > 0 & 10 / i > 0) return true; return false; }
    boolean E7_and_whl(Object x, int[] a, int i) { while (i > 0 & 10 / i > 0) { f++; } return true; }
    boolean E7_and_loc(Object x, int[] a, int i) { boolean r = i > 0 & 10 / i > 0; return r; }
    boolean E7_and_fld(Object x, int[] a, int i) { g = i > 0 & 10 / i > 0; return true; }
    boolean E7_and_arg(Object x, int[] a, int i) { use(i > 0 & 10 / i > 0); return true; }
    boolean E7_and_ter(Object x, int[] a, int i) { return (i > 0 & 10 / i > 0) ? true : false; }
    boolean E7_and_neg(Object x, int[] a, int i) { return !(i > 0 & 10 / i > 0); }
    boolean E7_and_asr(Object x, int[] a, int i) { assert i > 0 & 10 / i > 0; return true; }
    boolean E7_or_ret(Object x, int[] a, int i) { return i > 0 | 10 / i > 0; }
    boolean E7_or_iff(Object x, int[] a, int i) { if (i > 0 | 10 / i > 0) return true; return false; }
    boolean E7_or_whl(Object x, int[] a, int i) { while (i > 0 | 10 / i > 0) { f++; } return true; }
    boolean E7_or_loc(Object x, int[] a, int i) { boolean r = i > 0 | 10 / i > 0; return r; }
    boolean E7_or_fld(Object x, int[] a, int i) { g = i > 0 | 10 / i > 0; return true; }
    boolean E7_or_arg(Object x, int[] a, int i) { use(i > 0 | 10 / i > 0); return true; }
    boolean E7_or_ter(Object x, int[] a, int i) { return (i > 0 | 10 / i > 0) ? true : false; }
    boolean E7_or_neg(Object x, int[] a, int i) { return !(i > 0 | 10 / i > 0); }
    boolean E7_or_asr(Object x, int[] a, int i) { assert i > 0 | 10 / i > 0; return true; }
}
