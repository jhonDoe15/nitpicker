package p;
public class M {
    public Resp make() { return new Resp(); }
    public Resp made() { Resp r = new Resp(); return r; }
    public final Resp fmake() { return new Resp(); }
    static Resp smake() { return new Resp(); }
}
