package p;
public class Q {
    int q01(X y) {
        X w = y.nul();
        assert w.f == 3;
        return w.foo();
    }
    int q02(X y) {
        X w = y.nul();
        assert w != null : "m";
        X.use(w);
        return w.foo();
    }
    int q03(X y) {
        assert y.nul().f == 3;
        return 1;
    }
    int q04(X y) {
        assert y.nul().foo() > 0 : "m";
        return y.nul().foo();
    }
    boolean q05(X y) {
        if (y != null && y.nul() != null && y.nul().foo() > 0) { return y.nul().foo() > 1; }
        return false;
    }
    boolean q06(X y) {
        if (y != null && y.nul() != null) { return y.nul().foo() > 1 && y.nul().foo() > 2; }
        return false;
    }
    boolean q07(X y, X z) {
        return y.nul().foo() > 1 && z.nul().foo() > 2;
    }
    int q08(X y) {
        X w = y.nul();
        assert w.f == 3;
        return 1;
    }
    int q09(X y) {
        X w = y.nul();
        assert y.f == 3;
        return w.foo();
    }
    int q10(X y) {
        X w = y.nul();
        if (y.f == 3) {
            assert y.f == 3;
            return 1;
        }
        return w.foo();
    }
}
