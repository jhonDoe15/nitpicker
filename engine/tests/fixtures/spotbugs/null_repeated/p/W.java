package p;
public class W {
    public class T {
        Resp proxy(Object r) { return proxy(r, 1L); }
        private Resp proxy(Object r, long t) { Resp x = make(r); if (x.code() == 3) { System.out.println(); } return x; }
        Resp direct(Object r) { Resp x = make(r); x.code(); return x; }
    }
    static Resp make(Object r) { return r == null ? null : new Resp(); }
}
