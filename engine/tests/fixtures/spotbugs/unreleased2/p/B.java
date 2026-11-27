package p;

import java.util.concurrent.locks.*;

public class B {
    private final Lock lock = new ReentrantLock();
    private Lock nf = new ReentrantLock();
    private static final Lock ST = new ReentrantLock();
    private final ReentrantReadWriteLock rw = new ReentrantReadWriteLock();
    private final Lock w = rw.writeLock();
    private int n;
    private B o;
    private int[] arr = new int[1];
    private Object obj;

    void viaLocal() {
        Lock r = lock;
        r.lock();
        work();
        r.unlock();
    }

    void readTwice() {
        rw.readLock().lock();
        work();
        rw.readLock().unlock();
    }

    void writeField() {
        w.lock();
        work();
        w.unlock();
    }

    void nonFinal() {
        nf.lock();
        work();
        nf.unlock();
    }

    void staticField() {
        ST.lock();
        work();
        ST.unlock();
    }

    void param(Lock p) {
        p.lock();
        work();
        p.unlock();
    }

    void insideTry() {
        try {
            lock.lock();
            work();
        } finally {
            lock.unlock();
        }
    }

    void explicitThrow(boolean b) {
        lock.lock();
        if (b) {
            throw new IllegalStateException();
        }
        lock.unlock();
    }

    void swallow() {
        lock.lock();
        try {
            work();
        } catch (RuntimeException e) {
            return;
        }
        lock.unlock();
    }

    void condFinally(boolean b) {
        lock.lock();
        try {
            work();
        } finally {
            if (b) {
                lock.unlock();
            }
        }
    }

    void otherField() {
        lock.lock();
        o.n++;
        lock.unlock();
    }

    void array() {
        lock.lock();
        arr[0]++;
        lock.unlock();
    }

    void divide(int x) {
        lock.lock();
        n = n / x;
        lock.unlock();
    }

    void allocate() {
        lock.lock();
        obj = new Object();
        lock.unlock();
    }

    void cast() {
        lock.lock();
        String s = (String) obj;
        lock.unlock();
    }

    void staticCall() {
        lock.lock();
        n = Math.abs(n);
        lock.unlock();
    }

    void print() {
        lock.lock();
        System.out.println(n);
        lock.unlock();
    }

    void sync() {
        lock.lock();
        synchronized (this) {
            n++;
        }
        lock.unlock();
    }

    void returnEarly(boolean b) {
        lock.lock();
        if (b) {
            lock.unlock();
            return;
        }
        n++;
    }

    void work() {
        n--;
    }
}
