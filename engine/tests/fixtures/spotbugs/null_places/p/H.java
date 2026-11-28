package p;
public class H {
    Object lock = new Object();
    static Object SL;
    Object[] arr;
    synchronized void h14() { lock = null; lock.notify(); }
    void h15() { Object o = null; o.hashCode(); }
    void h16() { SL = null; SL.hashCode(); }
    void h17(Object p) { p = null; p.hashCode(); }
    void h18() { this.lock = null; this.lock.hashCode(); }
    void h19() { arr = null; int n = arr.length; }
    void h20(H h) { h.lock = null; h.lock.hashCode(); }
    void h21() { String s = null; s.length(); }
}
