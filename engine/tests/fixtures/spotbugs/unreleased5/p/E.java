package p;

import java.util.concurrent.locks.*;

public class E {
    private final Lock lk = new ReentrantLock();
    private final Lock other = new ReentrantLock();
    private static final Lock ST = new ReentrantLock();
    private E peer;
    private int n;

    void c1(Lock p) {
        mk().lock();
        work();
        p.unlock();
    }

    void c2(Lock p, Lock q) {
        p.lock();
        work();
        q.unlock();
    }

    void c3() {
        Lock a = new ReentrantLock();
        Lock b = new ReentrantLock();
        a.lock();
        work();
        b.unlock();
    }

    void c4() {
        lk.lock();
        work();
        mk().unlock();
    }

    void c5(Lock p) {
        lk.lock();
        work();
        p.unlock();
    }

    void c6(Lock p) {
        p.lock();
        work();
        lk.unlock();
    }

    void c7() {
        peer.lk.lock();
        work();
        lk.unlock();
    }

    void c8() {
        peer.lk.lock();
        work();
        peer.lk.unlock();
    }

    void c9(boolean b) {
        lk.lock();
        other.lock();
        if (b) {
            return;
        }
        lk.unlock();
        other.unlock();
    }

    void d1(boolean b) {
        lk.lock();
        if (b) {
            return;
        }
        work();
        lk.unlock();
    }

    void d2(Lock p) {
        Lock a = new ReentrantLock();
        a.lock();
        work();
        p.unlock();
    }

    void d3(boolean b) {
        lk.lock();
        work();
        lk.unlock();
        other.lock();
        if (b) {
            return;
        }
        other.unlock();
    }

    private void d4() {
        lk.lock();
        work();
        lk.unlock();
    }

    static void d5(Lock p, boolean b) {
        p.lock();
        if (b) {
            return;
        }
        p.unlock();
    }

    public void d6() {
        ST.lock();
        work();
        E.ST.unlock();
    }

    Lock mk() {
        return lk;
    }

    void work() {
        n--;
    }
}
