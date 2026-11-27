package p;

import java.util.concurrent.locks.*;
import java.util.*;

public class A {
    final Object lock = new Object();
    boolean ready;
    final Lock l = new ReentrantLock();
    final Condition c = l.newCondition();

    void a() throws InterruptedException { synchronized (lock) { lock.wait(); } }
    void b() throws InterruptedException { synchronized (lock) { while (!ready) { lock.wait(); } } }
    void c1() throws InterruptedException { synchronized (lock) { if (!ready) { lock.wait(); } } }
    void d() throws InterruptedException { synchronized (lock) { lock.wait(100); } }
    void e() throws InterruptedException { c.await(); }
    void f() throws InterruptedException { while (!ready) { c.await(); } }
    void g() { c.awaitUninterruptibly(); }
    void h() throws InterruptedException { c.awaitNanos(5); }
    void i() { synchronized (lock) { lock.notify(); } }
    void j() { synchronized (lock) { lock.notifyAll(); } }
    void k() { c.signal(); }
    synchronized void m() throws InterruptedException { wait(); }
    synchronized void n() { notify(); }
    void o() throws InterruptedException { synchronized (lock) { do { lock.wait(); } while (!ready); } }
    void q() throws InterruptedException { synchronized (lock) { for (;;) { lock.wait(); if (ready) break; } } }
    void r() throws InterruptedException { synchronized (lock) { lock.wait(); lock.wait(); } }
    void s() throws InterruptedException { synchronized (lock) { lock.wait(0, 1); } }
    void t() throws InterruptedException { c.await(1, java.util.concurrent.TimeUnit.SECONDS); }
    void u() throws InterruptedException { c.awaitUntil(new Date()); }
    void v() throws InterruptedException { for (int x = 0; x < 3; x++) {} synchronized (lock) { lock.wait(); } }
    void w() throws InterruptedException { synchronized (lock) { lock.wait(); } while (!ready) { Thread.sleep(1); } }
}
class B extends Thread {
    B() { start(); }
    B(int x) { this(); }
    B(String s) { super(s); if (s != null) start(); }
}
final class C extends Thread { C() { start(); } }
class D { D(Thread t) { t.start(); } D() { new Thread().start(); } }
class E extends Thread { E() { this.start(); } void go() { start(); } }
class F { Thread t = new Thread(); F() { t.start(); } }
class G extends B { G() { start(); } }
class H extends Thread { private H() { start(); } static H make() { return new H(); } }
