package p;
public class T {
    X x; boolean c; int k;
    int t01(X y) { boolean n = y == null; X.use(n); return y.foo(); }
    int t02(X y) { if (y == null) { } return y.foo(); }
    int t03(X y) { if (y == null) { int j = 1; } return y.foo(); }
    int t04(X y) { int j = y == null ? 1 : 2; return y.foo() + j; }
    int t05(X y) { X.use(y == null); return y.foo(); }
    int t06(X y) { if (y == null) { k++; } return y.foo(); }
    int t07(X y) { if (y == null) { k = 2; } return y.foo(); }
    int t08(X y) { if (y == null) { X.use(null); } if (c) { return 0; } return y.foo(); }
    int t09(X y) { if (y == null) { X.use(null); } if (c) { X.use(null); } return y.foo(); }
    int t10(X y) { if (y == null) { X.use(null); } for (int i = 0; i < 2; i++) { X.use(null); } return y.foo(); }
    int t11(X y) { if (y == null) { X.use(null); } try { X.use(null); } catch (RuntimeException e) { return 0; } return y.foo(); }
    int t12(X y) { if (y == null) { X.use(null); } X z = y; return z.foo(); }
    int t13(X y) { if (y == null) { X.use(null); } X.deref(y); return 0; }
    int t14(X y) { if (y == null) { X.use(null); } return y.next.foo(); }
    int t15(X y) { if (y == null && c) { X.use(null); } return y.foo(); }
    int t16(X y) { if (y == null || c) { X.use(null); } return y.foo(); }
    int t17(X y) { if (c && y == null) { X.use(null); } return y.foo(); }
    int t18(X y) { if (c || y == null) { X.use(null); } return y.foo(); }
    int t19(X y) { if (y != null) { X.use(null); } else { X.use(null); } return y.foo(); }
    int t20(X y) { if (null == y) { X.use(null); } return y.foo(); }
    int t21(X y) { X z = y != null ? y : null; return z.foo(); }
    int t22(X y) { X z = c ? y : null; return z.foo(); }
    int t23(X y) { X z = c ? null : y; X.use(null); return z.foo(); }
    int t24(X y) { X z; if (c) { z = null; } else { z = y; } return z.foo(); }
    int t25(X y) { X z = null; if (c) { z = y; } else { X.use(null); } return z.foo(); }
    int t26(X y) { X z = null; if (c) { z = y; } if (k > 0) { z = y.next; } return z.foo(); }
    int t27(X y) { X z = null; if (c) { z = y; } if (z == null) { X.use(null); } return z.foo(); }
    int t28(X y) { X z = null; return c ? z.foo() : 0; }
    int t29(X y) { X z = null; if (c) z = y; return z.foo() + z.foo(); }
    int t30(X y) { if (y == null) { throw new IllegalStateException(); } return y.foo(); }
    int t31(X y) { if (y == null) { X.use(null); } y = x; return y.foo(); }
    int t32(X y) { while (y == null) { X.use(null); } return y.foo(); }
    int t33(X y) { while (y != null) { y = y.next; } return y.foo(); }
    int t34(X y) { for (X z = y; z != null; z = z.next) { X.use(z); } return y.foo(); }
    int t35(X y) { if (y == null) { return x.foo(); } return y.foo(); }
    int t36(X y) { if (y == null) { X.use(null); return 0; } return y.foo(); }
    int t37(X y) { if (y instanceof X) { X.use(null); } return y.foo(); }
    int t38(X y) { X z = null; try { z = x.plain(); } catch (RuntimeException e) { X.use(null); } return z.foo(); }
    int t39(X y) { X z = null; try { z = x.plain(); } finally { X.use(null); } return z.foo(); }
    int t40(X y) { X z = null; try { z = x.plain(); } catch (RuntimeException e) { throw e; } return z.foo(); }
}
