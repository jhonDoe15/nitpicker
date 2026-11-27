package p;
import java.io.*;
public class F {
    static class M1 extends ByteArrayOutputStream { }
    static class M2 extends ByteArrayOutputStream { public synchronized String toString() { return "x"; } }
    ByteArrayOutputStream a = new ByteArrayOutputStream(); { a = new M1(); }
    ByteArrayOutputStream b = new ByteArrayOutputStream(); { b = new M2(); }
    ByteArrayOutputStream c = new M1(); { c = new M2(); }
    ByteArrayOutputStream d = new M1(); { d = new M1(); }
    private ByteArrayOutputStream e = new M2();
    public ByteArrayOutputStream g = new M2();
    protected ByteArrayOutputStream h = new M2();
    static ByteArrayOutputStream i = new M2();
    final ByteArrayOutputStream j = new M2();
    ByteArrayOutputStream k = new M1(); void setK(ByteArrayOutputStream x) { k = x; }
    void ta() { a.toString(); }
    void tb() { b.toString(); }
    void tc() { c.toString(); }
    void td() { d.toString(); }
    void te() { e.toString(); }
    void tg() { g.toString(); }
    void th() { h.toString(); }
    void ti() { i.toString(); }
    void tj() { j.toString(); }
    void tk() { k.toString(); }
    void tl(F o) { o.e.toString(); }
    void tm() { this.e.toString(); }
    // super in override
    static class S1 extends ByteArrayOutputStream { public synchronized String toString() { return super.toString(); } }
    static class S2 extends S1 { public synchronized String toString() { return super.toString(); } }
    static class S3 extends M1 { String z() { return super.toString(); } }
    static class S4 extends M1 { String z() { return super.toString(); } String y() { return toString(); } }
    static class S5 extends M1 { String z() { return super.toString(); } String y() { return super.toString(); } }
}
