package p;
public class J {
    X x;
    @javax.annotation.Nullable X jn() { return x; }
    @javax.annotation.CheckForNull X jc() { return x; }
    @javax.annotation.Nullable X jf;
    @javax.annotation.CheckForNull X cf;
    int j01() { return jn().foo(); }
    int j02() { return jc().foo(); }
    int j03() { return jf.foo(); }
    int j04() { return cf.foo(); }
    int j05(@javax.annotation.Nullable X y) { return y.foo(); }
    int j06(@javax.annotation.CheckForNull X y) { return y.foo(); }
}
