package p;
import java.util.*;
import java.util.function.*;
public class E {
    Object lock = new Object();
    static Object SL = new Object();
    int cnt;
    class In {
        Object q = new Object();
        synchronized void i01() { lock.notify(); }
        synchronized void i02() { E.this.lock.notify(); }
        synchronized void i03() { q.notify(); }
        synchronized void i04() { SL.notify(); }
        synchronized void i05() { notify(); }
        synchronized void i06() { In.this.notify(); }
        synchronized void i07() { E.this.notify(); }
        synchronized void i08() { E.this.cnt++; lock.notify(); }
        synchronized void i09() { cnt++; lock.notify(); }
        synchronized void i10() { new In(); lock.notify(); }
        synchronized void i11() { new E(); lock.notify(); }
        synchronized void i12() { E.this.new In(); lock.notify(); }
        class In2 { synchronized void j1() { lock.notify(); } synchronized void j2() { In.this.q.notify(); } synchronized void j3() { E.this.lock.notify(); } }
    }
    static class SN { Object z = new Object(); synchronized void s1() { z.notify(); } synchronized void s2() { new SN(); z.notify(); } }
    synchronized void e01() { new In(); lock.notify(); }
    static synchronized void e02() { new SN(); SL.notify(); }
    static synchronized void e03() { new E().new In(); SL.notify(); }
    synchronized void e04() { Runnable r = new Runnable() { public void run() { synchronized (lock) { lock.notify(); } } }; lock.notify(); }
    void e05(Object p) {
        Runnable r = new Runnable() { public synchronized void run() { p.notify(); } };
    }
    void e06(Object p) {
        Runnable r = new Runnable() { public synchronized void run() { lock.notify(); } };
    }
    void e07(Object p) {
        Runnable r = () -> { synchronized (p) { p.notify(); } };
    }
    void e08(Object p) {
        Consumer<Object> r = q -> { synchronized (q) { q.notify(); } };
    }
    void e09(Object p) {
        Object loc = new Object();
        Runnable r = () -> { synchronized (loc) { loc.notify(); } };
    }
    void e10() {
        Runnable r = () -> { synchronized (lock) { lock.notify(); } };
    }
    static void e11(Object p) {
        Runnable r = () -> { synchronized (p) { p.notify(); } };
    }
    static void e12() {
        Runnable r = () -> { synchronized (SL) { SL.notify(); } };
    }
    void e13(Object p) {
        class L { synchronized void m() { p.notify(); } }
    }
    static void e14(Object p) {
        class L { synchronized void m() { p.notify(); } synchronized void n() { SL.notify(); } }
    }
    void e15() {
        Object loc = new Object();
        Object anon = new Object() { synchronized void m() { loc.notify(); } synchronized void n() { lock.notify(); } synchronized void o() { E.this.lock.notify(); } };
    }
    void e16() {
        Runnable r = () -> { synchronized (this) { this.notify(); } };
    }
    void e17() {
        Runnable r = () -> { synchronized (this) { notify(); } };
    }
    void e18() {
        Runnable r = () -> { synchronized (lock) { cnt++; lock.notify(); } };
    }
    void e19() {
        Runnable r = () -> { synchronized (lock) { lock.notify(); } };
        Runnable r2 = () -> { synchronized (SL) { SL.notify(); } };
    }
    void e20(Object p) {
        Supplier<Runnable> s = () -> () -> { synchronized (p) { p.notify(); } };
    }
    void e21(Object p) {
        Runnable r = () -> { synchronized (p) { Runnable q = () -> { synchronized (p) { p.notify(); } }; p.notify(); } };
    }
    void e22(Object p, Object p2) {
        synchronized (p) { p2.notify(); }
        synchronized (p) { p.notify(); }
    }
    void e23(Object p) {
        synchronized (p) { Runnable r = new Runnable() { public void run() {} }; p.notify(); }
    }
    void e24(Object p) {
        synchronized (p) { Runnable r = () -> { cnt++; }; p.notify(); }
    }
    void e25(Object p) {
        synchronized (p) { Runnable r = () -> { p.hashCode(); }; p.notify(); }
    }
    void e26(Object p) {
        synchronized (p) { Runnable r = () -> { SL.hashCode(); }; p.notify(); }
    }
    void e27(Object p) {
        synchronized (p) { Runnable r = () -> { lock.hashCode(); }; p.notify(); }
    }
    void e28(Object p) {
        synchronized (p) { Runnable r = () -> { E.this.hashCode(); }; p.notify(); }
    }
    void e29(Object p) {
        synchronized (p) { Runnable r = () -> { cnt(); }; p.notify(); }
    }
    static void sc() {}
    void e30(Object p) {
        synchronized (p) { Runnable r = () -> { sc(); }; p.notify(); }
    }
    void e31(Object p) {
        synchronized (p) { Runnable r = () -> { int cnt = 1; cnt++; }; p.notify(); }
    }
    void e32(Object p) {
        synchronized (p) { Runnable r = () -> { int SL = 1; SL++; }; p.notify(); }
    }
    void e33(Object p) {
        synchronized (p) { Function<Object,Object> r = lock -> lock; p.notify(); }
    }
    void e34(Object p) {
        synchronized (p) { Function<Object,Object> r = x -> { Object lock = x; return lock; }; p.notify(); }
    }
    void e35(Object p) {
        synchronized (p) { Runnable r = () -> { Object o = new Object() { int f() { return cnt; } }; }; p.notify(); }
    }
    int cnt() { return 1; }
}
