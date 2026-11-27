package p;

import java.util.concurrent.locks.*;

public class A {
    final Object lock = new Object();
    final Condition c = new ReentrantLock().newCondition();
    boolean ready;
    double d;
    static double sd;
    static { int i = 3, j = 2; sd = i / j; }
    double fi = Math.ceil(ready ? 1 : 2);

    double a(int x, int y) {
        double r = x / y;
        r += Math.ceil(x);
        r += x / y;
        return r + Math.ceil(y);
    }
    A() { d = 3 / (int) sd; }
    A(int x, int y) { d = x / y; Runnable r = () -> d = x / y; }
    void b() throws InterruptedException {
        c.await();
        synchronized (lock) { lock.wait(); }
    }
    void b2() throws InterruptedException {
        synchronized (lock) { lock.wait(); }
        c.await();
    }
    void b3() throws InterruptedException {
        while (!ready) { c.await(); }
        synchronized (lock) { lock.wait(); }
    }
    void n1() { synchronized (lock) { lock.notify(); lock.notify(); } }
    void n2() { synchronized (this) { this.notify(); } }
    synchronized void n3() { notify(); ready = true; }
    public static class S { public S(Starter s) { s.start(); } public S(boolean b, Thread t) { if (b) { t.start(); } else { t.interrupt(); } } }
    public static class S2 { public S2(boolean b, Thread t) { if (b) { t.interrupt(); } else { t.start(); } } }
    static class Starter { void start() { } }
}
