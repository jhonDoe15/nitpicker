package p;

public class H5 {
    void h1(Object p) {
        try {
            p.notify();
        } finally {
        } Object r = new Object();
        p.hashCode();
    }
    void h2(Object p) {
        try {
            p.notify(); Object r = new Object(); } finally {
        }
        p.hashCode();
    }
    void h3(Object p) {
        synchronized (p) {
            p.notify(); Object r = new Object(); return;
        }
    }
    void h4(Object p) {
        synchronized (p) {
            p.notify(); Object r = new Object();
            return; }
    }
    void h5(int a, Object p) {
        a = 2; synchronized (p) { p.notify(); }
        p.hashCode();
    }
    void h6(Object p) {
        for (int i = 0; i < 2;
             i++) { synchronized (p) { Object r = new Object(); } }
    }
    void h7(Object p) {
        while (p != null) { synchronized (p) { Object r = new Object(); } }
    }
    void h8(Object p) {
        do { synchronized (p) { Object r = new Object(); } } while (p != null);
    }
    int h9(Object p) {
        synchronized (p) { Object r = new Object(); }
        return 1;
    }
    void i1(Object p) {
        synchronized (p) { Object r = null; Integer k = 5; long w = 7L; Object z = new Object(); z = p; }
        p.hashCode();
    }
}
