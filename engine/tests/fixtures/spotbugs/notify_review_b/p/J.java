package p;
import java.util.*;
import java.util.function.*;
public class J {
    Object lock = new Object();
    static Object SL = new Object();
    int cnt; static int scnt; final int fi = 3; static final int SFI = 3;
    class In {}
    static class SIn {}
    void m(Object p) {}
    static void sm(Object p) {}
    void j01(Object p) { synchronized (p) { Runnable r = () -> new In(); p.notify(); } }
    void j02(Object p) { synchronized (p) { Runnable r = () -> new SIn(); p.notify(); } }
    void j03(Object p) { synchronized (p) { Runnable r = () -> new Object() {}; p.notify(); } }
    void j04(Object p) { synchronized (p) { Runnable r = () -> { class L {} new L(); }; p.notify(); } }
    void j05(Object p) { synchronized (p) { Runnable r = () -> { int x = fi; }; p.notify(); } }
    void j06(Object p) { synchronized (p) { Runnable r = () -> { int x = SFI; }; p.notify(); } }
    void j07(Object p) { synchronized (p) { Runnable r = () -> { int x = scnt; }; p.notify(); } }
    void j08(Object p) { synchronized (p) { Runnable r = () -> { m(null); }; p.notify(); } }
    void j09(Object p) { synchronized (p) { Runnable r = () -> { sm(null); }; p.notify(); } }
    void j10(Object p) { synchronized (p) { Runnable r = () -> { J.this.m(null); }; p.notify(); } }
    void j11(Object p) { synchronized (p) { Runnable r = () -> { Object o = this; }; p.notify(); } }
    void j12(Object p) { synchronized (p) { Runnable r = () -> { Runnable q = this::j00; }; p.notify(); } }
    void j00() {}
    void j13(Object p) { synchronized (p) { Runnable r = () -> { Runnable q = J::sj; }; p.notify(); } }
    static void sj() {}
    void j14(Object p) { synchronized (p) { Runnable r = () -> { p.hashCode(); }; p.notify(); } }
    void j15(Object p) { synchronized (p) { Runnable r = () -> { String p2 = "a"; p2.length(); }; p.notify(); } }
    void j16(Object p) { synchronized (p) { Runnable r = () -> { for (int i = 0; i < 3; i++) {} }; p.notify(); } }
    void j17(Object p) { synchronized (p) { Runnable r = () -> { List<String> l = new ArrayList<>(); for (String s : l) {} }; p.notify(); } }
    void j18(Object p) { synchronized (p) { Runnable r = () -> { try { } catch (Exception e) { e.printStackTrace(); } }; p.notify(); } }
    void j19(Object p) { synchronized (p) { Runnable r = () -> { Object lock = new Object(); lock.hashCode(); }; p.notify(); } }
    void j20(Object p) { synchronized (p) { BiFunction<Object,Object,Object> r = (a, b) -> a; p.notify(); } }
    void j21(Object p) { synchronized (p) { Runnable r = () -> { Runnable z = () -> p.hashCode(); }; p.notify(); } }
    void j22(Object p) { synchronized (p) { Runnable r = () -> { Runnable z = () -> cnt++; }; p.notify(); } }
    void j23(Object p) { synchronized (p) { Runnable r = () -> { Object x = SL; Object y = x; }; p.notify(); } }
    void j24(Object p) { synchronized (p) { Runnable r = () -> { System.out.println(lock); }; p.notify(); } }
    void j25(Object p) { synchronized (p) { Runnable r = () -> { System.out.println(p); }; p.notify(); } }
    void j26(Object p) { synchronized (p) { Runnable r = () -> { this.cnt++; }; p.notify(); } }
    void j27(Object p) { synchronized (p) { Runnable r = () -> { super.hashCode(); }; p.notify(); } }
    void j28(Object p) { synchronized (p) { Runnable r = () -> { hashCode(); }; p.notify(); } }
    void j29(Object p) { synchronized (p) { Runnable r = () -> { new Thread(() -> {}).start(); }; p.notify(); } }
    void j30(Object p) { synchronized (p) { Runnable r = () -> { Object o = new Object() { Object g() { return p; } }; }; p.notify(); } }
    void j31(Object p) { synchronized (p) { Supplier<Object> r = () -> lock; p.notify(); } }
    void j32(Object p) { synchronized (p) { Supplier<Object> r = () -> J.this.lock; p.notify(); } }
    void j33(Object p) { synchronized (p) { Supplier<Object> r = () -> J.SL; p.notify(); } }
    void j34(Object p) { synchronized (p) { Supplier<Object> r = () -> (lock); p.notify(); } }
    void j35(Object p) { synchronized (p) { Function<Object,Integer> r = x -> x.hashCode() + cnt; p.notify(); } }
}
