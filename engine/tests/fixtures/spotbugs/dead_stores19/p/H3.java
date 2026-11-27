package p;

public class H3 {
    void e1(Object p) {
        p.hashCode();
        synchronized (p) { Object r = new Object(); p.notify(); } }
    void e2(Object p) {
        synchronized (p) { p.notify(); } Object r = new Object();
        p.hashCode();
    }
    void e3(Object p) {
        try { p.notify(); } finally { Object r = new Object(); }
        p.hashCode();
    }
    void e4(Object p) {
        Object r = new Object(); synchronized (p) { p.notify(); }
        p.hashCode();
    }
    void e5(Object p) {
        synchronized (p) { Object r = new Object(); p.notify();
            p.hashCode(); }
        p.hashCode();
    }
    void e6(Object p) {
        synchronized (p) { Object r = new Object(); p.notify(); }
        Object q = new Object();
    }
    void e7(Object p) {
        try { Object r = new Object(); p.notify(); } catch (Throwable t) { }
        p.hashCode();
    }
    void e8(Object p) {
        try { Object r = new Object(); p.notify(); } catch (RuntimeException t) { } finally { }
        p.hashCode();
    }
    void e9(Object p) {
        try { Object r = new Object(); p.notify(); } catch (RuntimeException t) { } finally { p.hashCode(); }
        p.hashCode();
    }
}
