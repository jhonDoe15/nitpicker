package p;
public interface J {
    default Resp h1(M m) {
        final Resp s = m.make();
        assert s != null : "x" + m;
        return s;
    }
}
