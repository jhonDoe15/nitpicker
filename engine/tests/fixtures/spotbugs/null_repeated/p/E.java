package p;
public class E {
    private final W.T agent;
    E(W.T agent) { this.agent = agent; }
    int e1() {
        Resp s = new Resp();
        Object v = s == null ? null : s.ok();
        if (s != null) { return 1; } else { return 2; }
    }
    int e2() {
        Resp s = new Resp();
        int x;
        if (s == null) { x = 1; } else { x = 2; }
        if (s != null) { return x; } else { return 2; }
    }
    int e3() {
        Resp s = new Resp();
        if (s == null) { System.out.println(); }
        if (s != null) { return 1; } else { return 2; }
    }
    int e4(Object q) {
        Resp s = agent.direct(q);
        Object v = s == null ? null : s.ok();
        if (s != null) { return 1; } else { return 2; }
    }
    int e5(Object q) {
        Resp s = agent.direct(q);
        if (s != null) { System.out.println(); }
        if (s != null) { return 1; } else { return 2; }
    }
    boolean e6(Object q) {
        Resp s = agent.direct(q);
        Object v = s == null ? null : s.ok();
        return s != null && s.ok() && v != null;
    }
    boolean e7(Object q) {
        Resp s = new Resp();
        if (s != null) { System.out.println(); }
        return s != null && s.ok();
    }
    int e8() {
        Resp s = new Resp();
        if (s == null) { return 0; }
        if (s != null) { return 1; } else { return 2; }
    }
}
