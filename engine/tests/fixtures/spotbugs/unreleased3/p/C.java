package p;

import java.util.concurrent.locks.*;

public class C {
    private final Lock lock = new ReentrantLock();
    private static final Lock ST = new ReentrantLock();
    private final ReentrantReadWriteLock rw = new ReentrantReadWriteLock();
    private int n;

    void a() {
        Lock r = rw.readLock();
        r.lock();
        work();
        r.unlock();
    }

    void b(boolean x) {
        Lock r = rw.readLock();
        r.lock();
        if (x) {
            return;
        }
        r.unlock();
    }

    void c() {
        ReentrantReadWriteLock.ReadLock r = rw.readLock();
        r.lock();
        work();
        r.unlock();
    }

    void d() {
        Lock r = make();
        r.lock();
        work();
        r.unlock();
    }

    void e() {
        Lock r = new ReentrantLock();
        r.lock();
        work();
        r.unlock();
    }

    void g() {
        rw.readLock().lock();
        work();
        lock.unlock();
    }

    void h() {
        lock.lock();
        work();
        ST.unlock();
    }

    void i(boolean x) {
        lock.lock();
        if (x) {
            return;
        }
        ST.unlock();
    }

    void j() {
        Lock r = rw.readLock();
        r.lock();
        try {
            work();
        } finally {
            r.unlock();
        }
    }

    void k(boolean x) {
        Lock r = make();
        r.lock();
        if (x) {
            return;
        }
        r.unlock();
    }

    void l(boolean x) {
        Lock r = new ReentrantLock();
        r.lock();
        if (x) {
            return;
        }
        r.unlock();
    }

    void m(ReadWriteLock p) {
        p.writeLock().lock();
        work();
        p.writeLock().unlock();
    }

    void q() {
        ReentrantLock r = new ReentrantLock();
        r.lock();
        work();
        r.unlock();
    }

    Lock make() {
        return lock;
    }

    void work() {
        n--;
    }
}
