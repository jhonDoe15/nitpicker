package p;
import java.util.*;
import java.util.function.*;
public class L {
    static Object SL = new Object();
    Object lock = new Object();
    static synchronized void l01(Object p) { Object x = new Object() { int g() { return p.hashCode(); } }; SL.notify(); }
    static synchronized void l02(Object p) { class Q { int g() { return p.hashCode(); } } Object x = new Q(); SL.notify(); }
    static synchronized void l03(Object p) { class Q { int g() { return 1; } } Object x = new Q(); SL.notify(); }
    static synchronized void l04() { int k = 3; Object x = new Object() { int g() { return k; } }; SL.notify(); }
    static synchronized void l05() { final int k = 3; Object x = new Object() { int g() { return k; } }; SL.notify(); }
    static synchronized void l06(Object p) { Runnable r = () -> p.hashCode(); SL.notify(); }
    static synchronized void l07(Object p) { Runnable r = () -> {}; SL.notify(); }
    static synchronized void l08(Object p) { Runnable r = () -> { class Q {} new Q(); }; SL.notify(); }
    static synchronized void l09() { class Q {} Object x = new Q(); SL.notify(); }
    synchronized void l10() { class Q {} Object x = new Q(); lock.notify(); }
    synchronized void l11(Object p) { class Q { Object g() { return p; } } Object x = new Q(); lock.notify(); }
    static synchronized void l12(Object p) { class Q { Object g() { return p; } } Q q = null; SL.notify(); }
    static synchronized void l13(Object p) { class Q { Object g() { return p; } } class R extends Q {} Object x = new R(); SL.notify(); }
    static synchronized void l14(Object p) { class Q { Object g() { return p; } } Supplier<Q> s = Q::new; SL.notify(); }
    static synchronized void l15(Object p) { Object x = new ArrayList<String>() { { add(p.toString()); } }; SL.notify(); }
    static synchronized void l16() { Object x = new ArrayList<String>() { { add("a"); } }; SL.notify(); }
    static synchronized void l17(Object p) { Object x = new Object() { Object w = p; }; SL.notify(); }
    static synchronized void l18(Object p) { Object x = new Thread(() -> p.hashCode()); SL.notify(); }
    static synchronized void l19(Object p) { Object x = new Thread(new Runnable() { public void run() { p.hashCode(); } }); SL.notify(); }
}
