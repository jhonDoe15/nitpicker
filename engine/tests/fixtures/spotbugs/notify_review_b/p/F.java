package p;
public class F {
    Object lock = new Object();
    static Object SL = new Object();
    class In { class In2 {} }
    static F mk() { return null; }
    static synchronized void f01() { new F().new In(); SL.notify(); }
    static synchronized void f02() { Object o = new F().new In(); SL.notify(); }
    static synchronized void f03(F p) { p.new In(); SL.notify(); }
    static synchronized void f04() { mk().new In(); SL.notify(); }
    static synchronized void f05() { F f = null; f.new In(); SL.notify(); }
    synchronized void f06() { this.new In(); lock.notify(); }
    synchronized void f07() { new In().new In2(); lock.notify(); }
    synchronized void f08() { In i = null; i.new In2(); lock.notify(); }
    static synchronized void f09() { new F().new In().new In2(); SL.notify(); }
    static synchronized void f10() { new F().new In() {}; SL.notify(); }
    synchronized void f11() { new In() {}; lock.notify(); }
    synchronized void f12() { new F().new In() {}; lock.notify(); }
    synchronized void f13() { mk().new In() {}; lock.notify(); }
}
