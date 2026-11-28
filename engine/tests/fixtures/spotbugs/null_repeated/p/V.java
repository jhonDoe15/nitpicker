package p;
public class V {
    private final W.T agent;
    V(W.T agent) { this.agent = agent; }
    void c1() {
        Resp s = new Resp();
        if (s != null) { System.out.println(1); }
        if (s != null) { System.out.println(2); } else { System.out.println(3); }
    }
    void c2(Resp s) {
        s.ok();
        if (s != null) { System.out.println(1); }
        if (s != null) { System.out.println(2); } else { System.out.println(3); }
    }
    void c3(Object q) {
        Resp s = agent.direct(q);
        if (s != null) { System.out.println(1); }
        if (s != null) { System.out.println(2); } else { System.out.println(3); }
    }
    void c4(Resp s) {
        if (s == null) { return; }
        if (s != null) { System.out.println(1); }
        if (s != null) { System.out.println(2); } else { System.out.println(3); }
    }
    void c5(Resp s) {
        s.ok();
        if (s != null && s.ok()) { System.out.println(1); } else if (s != null) { System.out.println(2); }
    }
    void c6(Object q) {
        Resp s = agent.direct(q);
        if (s != null && s.ok()) {
            System.out.println(1);
        } else if (s != null) {
            System.out.println(2);
        } else {
            System.out.println(3);
        }
    }
    void c7(Object q) {
        Resp s = new Resp();
        if (s != null) { System.out.println(1); }
        System.out.println(s
            != null ? 2 : 3);
    }
}
