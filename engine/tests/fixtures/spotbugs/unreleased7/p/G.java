package p;

import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.*;

public class G {
    private final Lock lk = new ReentrantLock();
    private final Lock other = new ReentrantLock();
    private final MyLock my = new MyLock();
    private final Plain plain = new Plain();
    private int n;

    static class MyLock extends ReentrantLock {
    }

    static class Plain {
        void lock() {
        }

        void unlock() {
        }
    }

    void g1() {
        Lock x = lk;
        x.lock();
        x = other;
        x.unlock();
    }

    void g2(Lock[] a, Lock[] b) {
        a[0].lock();
        work();
        b[0].unlock();
    }

    void g3() {
        my.lock();
        work();
        my.unlock();
    }

    void g4(boolean b) {
        plain.lock();
        if (b) {
            return;
        }
        plain.unlock();
    }

    void g5(boolean b) {
        lk.lock();
        if (b) {
            return;
        }
        plain.unlock();
    }

    void g6(boolean b) throws InterruptedException {
        lk.lockInterruptibly();
        if (b) {
            return;
        }
        lk.unlock();
    }

    void g7(boolean b) {
        if (!lk.tryLock()) {
            return;
        }
        if (b) {
            return;
        }
        lk.unlock();
    }

    void g8(boolean b) throws InterruptedException {
        if (!lk.tryLock(1, TimeUnit.SECONDS)) {
            return;
        }
        work();
        lk.unlock();
    }

    void g9() {
        Runnable r = () -> lk.unlock();
        lk.lock();
        work();
        r.run();
    }

    void h1() {
        lk.lock();
        work();
        Condition c = lk.newCondition();
        lk.unlock();
    }

    void h2() {
        try {
            lk.lock();
            work();
        } finally {
            other.unlock();
        }
    }

    void h3(boolean b) {
        lk.lock();
        try {
            if (b) {
                throw new IllegalStateException();
            }
        } finally {
            lk.unlock();
        }
    }

    void h4() {
        lk.lock();
        try {
            work();
        } finally {
            lk.unlock();
        }
        work();
        lk.lock();
        work();
        lk.unlock();
    }

    void h5(Iterable<Lock> ls) {
        for (Lock l : ls) {
            l.lock();
            work();
            l.unlock();
        }
    }

    void work() {
        n--;
    }
}
