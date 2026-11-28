package p;

public class H2 {
    void b1(Object p) { synchronized (p) { Object r = new Object(); p.notify(); }
    }
    void b2(Object p) {
        synchronized (p) { Object r = new Object(); p.notify();
        }
    }
    void b3(Object p) {
        synchronized (p) { Object r = new Object();
            p.notify(); }
    }
    void b4(Object p) {
        try { Object r = new Object(); p.notify(); } catch (RuntimeException e) { }
    }
    void b5(Object p) {
        try { Object r = new Object(); p.notify(); } finally { p.hashCode(); }
    }
    void b6(Object p) {
        int x = 1; synchronized (p) { Object r = new Object(); p.notify(); }
    }
    void b7(Object p) {
        synchronized (p) { Object r = new Object(); p.notify(); } p.hashCode();
    }
    void b8(Object p) {
        synchronized (p) { Object r = new Object(); p.notify(); }
        p.hashCode();
    }
    void b9(Object p) {
        Object r;
        synchronized (p) { r = new Object(); p.notify(); }
    }
    void c1(Object p) {
        synchronized (p) { int r = p.hashCode(); p.notify(); }
    }
    void c2(Object p) {
        synchronized (p) {
            synchronized (this) { Object r = new Object(); p.notify(); }
        }
    }
    void c3(Object p) {
        synchronized (p) { Object r = new Object(); p.notify(); return; }
    }
}
