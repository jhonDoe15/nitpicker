package p;

import java.util.concurrent.locks.*;

public class D {
    private final Lock lk = new ReentrantLock();
    private final Lock other = new ReentrantLock();
    private final ReentrantReadWriteLock rw = new ReentrantReadWriteLock();
    private Lock nf = new ReentrantLock();
    private int n;
    private Object obj;

    void a1() {
        rw.readLock().lock();
        work();
        rw.writeLock().unlock();
    }

    void a2() {
        mk().lock();
        work();
        mk().unlock();
    }

    void a3() {
        mk().lock();
        work();
        mk2().unlock();
    }

    void a4(boolean b) {
        Lock x = b ? lk : other;
        x.lock();
        work();
        x.unlock();
    }

    void a5() {
        nf.lock();
        nf = new ReentrantLock();
        nf.unlock();
    }

    void a6() {
        lk.lock();
        String s = "a" + n;
        lk.unlock();
    }

    void a7() {
        lk.lock();
        Object o = obj;
        lk.unlock();
    }

    void a8() {
        lk.lock();
        int[] a = new int[n];
        lk.unlock();
    }

    void a9(int x) {
        lk.lock();
        n = n + x * 2;
        lk.unlock();
    }

    void b1() {
        lk.lock();
        lk.unlock();
        work();
    }

    void b2() {
        lk.lock();
        try {
            work();
        } catch (Exception e) {
            n++;
        }
        lk.unlock();
    }

    void b3() {
        lk.lock();
        try {
            work();
        } catch (Throwable e) {
            lk.unlock();
            throw e;
        }
        lk.unlock();
    }

    void b4(boolean b) {
        lk.lock();
        while (b) {
            work();
        }
        lk.unlock();
    }

    void b5() {
        other.lock();
        lk.lock();
        try {
            work();
        } finally {
            lk.unlock();
        }
    }

    void b6(Lock[] ls) {
        ls[0].lock();
        work();
        ls[0].unlock();
    }

    void b7() {
        Runnable r = () -> {
            lk.lock();
            work();
            lk.unlock();
        };
        r.run();
    }

    void b8(boolean b) {
        if (b) {
            lk.lock();
        }
        work();
        if (b) {
            lk.unlock();
        }
    }

    void b9() {
        lk.lock();
        lk.lock();
        work();
        lk.unlock();
    }

    Lock mk() {
        return lk;
    }

    Lock mk2() {
        return other;
    }

    void work() {
        n--;
    }
}
