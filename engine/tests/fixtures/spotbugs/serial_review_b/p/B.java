package p;
import java.io.Serializable;
import java.util.*;
public class B implements Serializable {
    private static final long serialVersionUID = 1L;
    private List<String> xs;
    private Map<String, Integer> m;
    private Collection<Thread> ts;
    private Runnable r;
    private Object o;
    private Iterable<String> it;
    public B(List<String> xs, Map<String, Integer> m, Collection<Thread> ts) { this.xs = xs; this.m = m; this.ts = ts; this.r = () -> {}; this.o = new Thread(); this.it = new ArrayList<>(); }
    static final Object SA = new Serializable() { Thread t = new Thread(); public String toString() { return t.getName(); } };
    static Runnable lam() {
        return () -> {
            Object x = new B.Inner() { Thread t = new Thread(); public String toString() { return t.getName(); } };
        };
    }
    static class Inner implements Serializable { private static final long serialVersionUID = 1L; }
}
