package p;
public class K {
    Resp f;
    final Resp g = new Resp();
    static Resp make() { return System.nanoTime() % 2 == 0 ? null : new Resp(); }
    static void use(Object o) { System.out.println(o); }
    void k1(Resp a) {
        Resp b = a;
        if (b == null) {
            use(a);
        }
    }
    void k2(Resp a) {
        Resp b = a;
        if (a == null) { return; }
        if (b != null) { use(1); } else { use(2); }
    }
    void k3(Resp a) {
        Resp b = a;
        if (b == null) { return; }
        if (a != null) { use(1); } else { use(2); }
    }
    void k4(Resp a) {
        Resp b = a;
        a = make();
        if (a == null) { return; }
        if (b != null) { use(1); } else { use(2); }
    }
    void k5() {
        Resp b = f;
        if (b == null) { return; }
        if (f != null) { use(1); } else { use(2); }
    }
    void k6() {
        Resp b = f;
        if (f == null) { return; }
        if (b != null) { use(1); } else { use(2); }
    }
    void k7(Resp a) {
        Resp b = a;
        Resp c = b;
        if (a == null) { return; }
        if (c != null) { use(1); } else { use(2); }
    }
    void k8(Resp a) {
        Resp b;
        b = a;
        if (a == null) { use(b); }
    }
    void k9(Resp a) {
        a.ok();
        Resp b = a;
        if (b != null) { use(1); } else { use(2); }
    }
    void k10(Resp a) {
        Resp b = a;
        b.ok();
        if (a != null) { use(1); } else { use(2); }
    }
    void k11(Resp a) {
        Resp b = a;
        if (a == null) { use(1); }
        b = make();
        if (b != null) { use(1); } else { use(2); }
    }
    void k12(Resp a, boolean c) {
        Resp b = c ? a : null;
        if (a == null) { return; }
        if (b != null) { use(1); } else { use(2); }
    }
}
