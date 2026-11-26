package p;
public class B {
    Resp h2(M m) {
        Resp s = m.make();
        assert s != null : "x";
        return s;
    }
    Resp h3(M m) {
        Resp s = m.made();
        assert s != null : "x";
        return s;
    }
    Resp h4(M m) {
        Resp s = m.fmake();
        assert s != null : "x";
        return s;
    }
    Resp h5() {
        Resp s = M.smake();
        assert s != null : "x";
        return s;
    }
    Resp h6(M m) {
        Resp s = m.make();
        if (s == null) { throw new IllegalStateException(); }
        return s;
    }
    Resp h7(M m) {
        Resp s = m.make();
        if (s != null) { System.out.println(); } else { System.out.println(2); }
        return s;
    }
    Resp h8(Resp s, int n) {
        assert s == null || s.ok() : "rows " + (s == null ? 0 : 1) + n;
        return s;
    }
}
