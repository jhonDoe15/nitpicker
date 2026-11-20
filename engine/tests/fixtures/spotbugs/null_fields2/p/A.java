package p;
public class A {
    X x; boolean c; @Nullable X nf; A other = new A();
    void ifoo() { }
    int a01() {
        X y = nf;
        X.use(null);
        return y.foo();
    }
    int a02(X y) {
        if (y == null) {
            X.use(null);
        }
        X.use(null);
        return y.foo();
    }
    int a03(X y) {
        X z = null;
        if (c) {
            z = y;
        }
        X.use(null);
        return z.foo();
    }
    int a04() {
        if (nf == null) {
            X.use(null);
        }
        X.use(null);
        return nf.foo();
    }
    int a05() {
        X y = x.nul();
        if (y == null) {
            X.use(y);
        }
        X.use(null);
        return y.foo();
    }
    int a06(X y) {
        X z = c
            ? null
            : y;
        X.use(null);
        return z.foo();
    }
    int a07() {
        X.use(nf);
        X.use(null);
        return nf.foo();
    }
    int a08() {
        X y = c ? nf : x;
        X.use(null);
        return y.foo();
    }
    int a09() {
        if (other.nf != null) {
            ifoo();
            return other.nf.foo();
        }
        return 0;
    }
    int a10() {
        if (other.nf != null) {
            other.ifoo();
            return other.nf.foo();
        }
        return 0;
    }
    int a11() {
        A o = other;
        if (o.nf != null) {
            ifoo();
            return o.nf.foo();
        }
        return 0;
    }
    int a12() {
        if (nf != null) {
            X.use(other);
            return nf.foo();
        }
        return 0;
    }
    int a13() {
        if (nf != null) {
            other.x = nf;
            new A().ifoo();
            return nf.foo();
        }
        return 0;
    }
    int a14(X y) {
        if (y == null) {
            X.use(null);
        }
        if (c) {
            X.use(null);
            return y.foo();
        }
        return y.f;
    }
    int a15() {
        X y = nf;
        if (c) {
            X.use(null);
            return y.foo();
        }
        return y.f;
    }
    int a17() {
        int n = nf.f;
        ifoo();
        if (c) {
            return 0;
        }
        return nf.foo();
    }
    int a18() {
        java.util.List<X> l = java.util.List.of();
        l.forEach(e -> e.nul().foo());
        return x.nul()
            .next.f;
    }
}
