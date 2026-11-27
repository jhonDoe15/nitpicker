package p;

import java.util.concurrent.locks.*;

public class V {
    private final ReentrantReadWriteLock rw = new ReentrantReadWriteLock();
    private final Lock lk = new ReentrantLock();
    private int n;
    private V[] segs = new V[2];
    private final Lock own = new ReentrantLock();
    private Object map;

    int w1(boolean block) {
        boolean locked = true;
        if (block) {
            lk.lock();
        } else {
            locked = lk.tryLock();
        }
        if (locked) {
            try {
                return calc();
            } finally {
                lk.unlock();
            }
        } else {
            return calc();
        }
    }

    int w2(boolean block, boolean locked) {
        if (block) {
            lk.lock();
        }
        if (locked) {
            try {
                return calc();
            } finally {
                lk.unlock();
            }
        }
        return calc();
    }

    int w3(boolean block) {
        boolean locked = true;
        if (block) {
            lk.lock();
        } else {
            locked = false;
        }
        if (locked) {
            lk.unlock();
        }
        return calc();
    }

    void f1() {
        for (V s : segs) {
            s.own.lock();
            try {
                if (s.map == null) {
                    continue;
                }
                work();
            } finally {
                s.own.unlock();
            }
        }
    }

    void f2() {
        for (V s : segs) {
            s.own.lock();
            try {
                work();
            } finally {
                s.own.unlock();
            }
        }
    }

    void f3() {
        V s = segs[0];
        s.own.lock();
        try {
            work();
        } finally {
            s.own.unlock();
        }
    }

    int calc() {
        return n;
    }

    void work() {
        n--;
    }
}
