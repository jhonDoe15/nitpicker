package p;
public class D {
    static Resp make() { return System.nanoTime() % 2 == 0 ? null : new Resp(); }
    void d1(Resp s) {
        if (s == null) { return; }
        if (s != null) { System.out.println(1); } else { System.out.println(2); }
        s = make();
        if (s == null) { return; }
        if (s != null) { System.out.println(3); } else { System.out.println(4); }
    }
    void d2(Resp s) {
        if (s == null) { return; }
        if (s != null) { System.out.println(1); } else { System.out.println(2); }
        if (s != null) { System.out.println(3); }
    }
    void d3(Resp s) {
        if (s == null) { return; }
        if (s != null) { System.out.println(1); } else { System.out.println(2); }
        if (s != null) { System.out.println(3); } else { System.out.println(4); }
    }
    void d4(Resp s, Resp t) {
        if (s == null || t == null) { return; }
        if (s != null) { System.out.println(1); } else { System.out.println(2); }
        if (t != null) { System.out.println(3); } else { System.out.println(4); }
    }
    void d5(Resp s) {
        if (s == null) { return; }
        if (s != null) { System.out.println(1); }
    }
    void d6(Resp s) {
        if (s == null) { return; }
        if (s != null) { System.out.println(1); }
        if (s != null) { System.out.println(3); }
    }
    void d7(Resp s) {
        s.ok();
        if (s != null) { System.out.println(1); } else { System.out.println(2); }
        if (s != null) { System.out.println(3); } else { System.out.println(4); }
    }
    void d8(Resp s) {
        s.ok();
        if (s != null) { System.out.println(1); }
        if (s != null) { System.out.println(3); }
    }
    void d9(Resp s) {
        Resp t = new Resp();
        if (t != null) { System.out.println(1); }
        if (t != null) { System.out.println(3); }
    }
}
