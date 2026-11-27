package p;

import java.util.concurrent.locks.*;

public class A {
    private final Lock lock = new ReentrantLock();
    private final ReentrantReadWriteLock rw = new ReentrantReadWriteLock();
    private final ReentrantLock rl = new ReentrantLock();
    private int n;

    void ok1() {
        lock.lock();
        try {
            n++;
        } finally {
            lock.unlock();
        }
    }

    void noRel() {
        lock.lock();
        n++;
    }

    void someBranch(boolean b) {
        lock.lock();
        if (b) {
            return;
        }
        lock.unlock();
    }

    void exceptionPath() {
        lock.lock();
        work();
        lock.unlock();
    }

    void exceptionPathNoCall() {
        lock.lock();
        n++;
        lock.unlock();
    }

    void local() {
        Lock l = new ReentrantLock();
        l.lock();
        n++;
    }

    void rdl() {
        rw.readLock().lock();
        n++;
    }

    void rdlLocal() {
        Lock r = rw.readLock();
        r.lock();
        work();
        r.unlock();
    }

    void reentrant() {
        rl.lock();
        work();
        rl.unlock();
    }

    boolean tryL() {
        if (lock.tryLock()) {
            n++;
            return true;
        }
        return false;
    }

    void interruptibly() throws InterruptedException {
        lock.lockInterruptibly();
        n++;
    }

    void relOnly() {
        lock.unlock();
    }

    void relOnlyLocal() {
        Lock l = new ReentrantLock();
        l.unlock();
    }

    void twice() {
        lock.lock();
        lock.lock();
        lock.unlock();
    }

    void loop(int k) {
        for (int i = 0; i < k; i++) {
            lock.lock();
        }
        lock.unlock();
    }

    void work() {
        n--;
    }
}
