package p;

public class H1 {
    static Object SL = new Object();
    int cnt;

    void a1(Object p) {
        synchronized (p) { Runnable r = () -> { SL.hashCode(); }; p.notify(); }
    }
    void a2(Object p) { synchronized (p) { Runnable r = () -> { SL.hashCode(); }; p.notify(); } }
    void a3(Object p) {
        synchronized (p) { Runnable r = () -> { SL.hashCode(); }; }
    }
    void a4(Object p) {
        synchronized (p) { Object r = new Object(); p.notify(); }
    }
    void a5(Object p) {
        synchronized (p) {
            Object r = new Object();
            p.notify();
        }
    }
    void a6(Object p) {
        synchronized (p) { Object r = new Object(); }
    }
    void a7(Object p) {
        synchronized (p) { Object r = new Object(); p.hashCode(); }
    }
    void a8(Object p) {
        Object r = new Object(); p.notify();
    }
    void a9(Object p) {
        synchronized (p) { p.notify(); Object r = new Object(); }
    }
}
