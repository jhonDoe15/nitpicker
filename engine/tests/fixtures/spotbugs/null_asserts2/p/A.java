package p;
public class A {
    private final W.T agent;
    A(W.T agent) { this.agent = agent; }
    Resp g1(Object q) {
        Resp s = agent.direct(q);
        assert s != null : "x" + q;
        return s;
    }
    Resp g2() {
        Resp s = new Resp();
        assert s != null;
        return s;
    }
    Resp g3(Resp s) {
        s.ok();
        assert s != null;
        return s;
    }
    Resp g4(Resp s) {
        if (s == null) { return null; }
        assert s != null;
        return s;
    }
    Resp g5(Object q) {
        Resp s = agent.direct(q);
        assert s != null && s.ok();
        return s;
    }
    Resp g6(Object q) {
        Resp s = agent.direct(q);
        assert s == null || s.ok();
        return s;
    }
    Resp g7(Object q) {
        Resp s = agent.direct(q);
        if (s != null) { System.out.println(); } else { System.out.println(2); }
        assert s != null;
        return s;
    }
    Resp g8(Object q) {
        Resp s = null;
        assert s == null;
        return s;
    }
    void g9(Object q) {
        Resp s = agent.direct(q);
        assert s != null;
        if (s != null) { System.out.println(); } else { System.out.println(2); }
    }
}
