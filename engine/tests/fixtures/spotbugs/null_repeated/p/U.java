package p;
public class U {
    private final W.T agent;
    U(W.T agent) { this.agent = agent; }
    void a1(Object q) {
        Resp s = (Resp) agent.proxy(q);
        if (s != null && s.ok()) { System.out.println(1); } else if (s != null) { System.out.println(2); }
    }
    void a2(Object q) {
        Resp s = agent.proxy(q);
        if (s != null && s.ok()) { System.out.println(1); } else if (s != null) { System.out.println(2); }
    }
    void a3(Object q) {
        Resp s = (Resp) agent.direct(q);
        if (s != null && s.ok()) { System.out.println(1); } else if (s != null) { System.out.println(2); }
    }
    void a4(Object q) {
        Resp s = (Resp) agent.direct(q);
        if (s != null) { System.out.println(1); }
    }
    void a5(Object q) {
        Resp s = agent.direct(q);
        if (s != null && s.ok()) { System.out.println(1); } else if (s != null) { System.out.println(2); }
    }
    void a6(Resp s) {
        if (s != null && s.ok()) { System.out.println(1); } else if (s != null) { System.out.println(2); }
    }
    void a7(Object q) {
        Resp s = agent.direct(q);
        if (s != null) { System.out.println(1); } else { System.out.println(2); }
    }
    void a8(Object q) {
        Resp s = new Resp();
        if (s != null && s.ok()) { System.out.println(1); } else if (s != null) { System.out.println(2); }
    }
    void a9(Object q) {
        Resp s = new Resp();
        if (s != null
            && s.ok()) {
            System.out.println(1);
        } else if (s
            != null) {
            System.out.println(2);
        }
    }
    void b1(Object q) {
        Resp s = new Resp();
        if (s != null
            && s.ok()) {
            System.out.println(1);
        }
    }
    void b2(Object q) {
        Resp s = new Resp();
        if (s == null
            || s.ok()) {
            System.out.println(1);
        }
    }
}
