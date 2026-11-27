package p;

import java.util.concurrent.locks.*;

public class R {
    private final ReentrantReadWriteLock rw = new ReentrantReadWriteLock();
    private final Lock lk = new ReentrantLock();
    private int n;

    void tf1() {
        rw.readLock().lock();
        try {
            work();
        } finally {
            rw.readLock().unlock();
        }
    }

    void tf2() {
        rw.readLock().lock();
        n++;
        rw.readLock().unlock();
    }

    void tf3() {
        mk().lock();
        try {
            work();
        } finally {
            mk().unlock();
        }
    }

    int tf4() {
        rw.writeLock().lock();
        try {
            return calc();
        } finally {
            rw.writeLock().unlock();
        }
    }

    void tf5() {
        mk().lock();
        n++;
        mk().unlock();
    }

    Lock mk() {
        return lk;
    }

    int calc() {
        return n;
    }

    void work() {
        n--;
    }
}
