package p;

import java.util.concurrent.locks.*;

public class A {
    final Object lock = new Object();
    boolean ready;
    final Lock l = new ReentrantLock();
    final Condition c = l.newCondition();

    void a() throws InterruptedException {
        synchronized (lock) {
            lock.wait();
            lock.wait();
        }
    }
    void b() throws InterruptedException {
        synchronized (lock) {
            lock.wait(5);
            lock.wait();
        }
    }
    void c() throws InterruptedException {
        synchronized (lock) {
            while (!ready) { lock.wait(); }
            lock.wait();
        }
    }
    void d() throws InterruptedException {
        synchronized (lock) {
            lock.wait();
            while (!ready) { lock.wait(); }
        }
    }
    void e() {
        Runnable r = () -> { synchronized (lock) { try { lock.wait(); } catch (InterruptedException x) { } } };
        while (!ready) { r.run(); }
    }
    void f() {
        while (!ready) {
            Runnable r = () -> { synchronized (lock) { try { lock.wait(); } catch (InterruptedException x) { } } };
            r.run();
        }
    }
    void g() throws InterruptedException {
        while (!ready) {
            try { synchronized (lock) { lock.wait(); } } finally { ready = false; }
        }
    }
    void h() throws InterruptedException {
        c.await();
        c.await();
    }
    void i() throws InterruptedException {
        c.awaitUninterruptibly();
        c.await();
    }
    void j(Thread t) throws InterruptedException { synchronized (t) { t.wait(); } }
    void k(Condition x) throws InterruptedException { x.await(); }
    void m(MyCond x) throws InterruptedException { x.await(); }
    void n() throws InterruptedException {
        synchronized (lock) {
            lock.wait();
        }
        synchronized (lock) {
            lock.wait();
        }
    }
    void o() throws InterruptedException {
        while (!ready) {
            new Object() { void z() throws InterruptedException { synchronized (this) { wait(); } } }.z();
        }
    }
    void q() throws InterruptedException {
        lock.wait(5, 0);
        lock.wait(7);
    }
    void r(int x) throws InterruptedException {
        switch (x) { case 1: lock.wait(); break; default: break; }
    }
    void s() throws InterruptedException {
        label: { lock.wait(); }
    }
    void t() throws InterruptedException {
        int i = 0;
        do { i++; } while (i < 3);
        lock.wait();
    }
    void u() throws InterruptedException {
        for (String s : new String[0]) { }
        lock.wait();
    }
    void v() throws InterruptedException {
        while (true) {
            if (ready) return;
        }
    }
}
abstract class MyCond implements Condition { }
