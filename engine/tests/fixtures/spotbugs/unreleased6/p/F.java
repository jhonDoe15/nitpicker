package p;

import java.util.concurrent.locks.*;

public class F {
    private final Lock lk = new ReentrantLock();
    private F peer;
    private int n;
    private final Lock[] arr = new Lock[2];

    void e1() {
        mk().lock();
        work();
        peer.mk().unlock();
    }

    void e2() {
        get(0).lock();
        work();
        get(1).unlock();
    }

    void e3() {
        smk().lock();
        work();
        smk().unlock();
    }

    void e4() {
        mk().lock();
        work();
        Lock x = mk();
        x.unlock();
    }

    void e5() {
        mk().lock();
        work();
        arr[0].unlock();
    }

    void e6(Lock[] ls) {
        ls[0].lock();
        work();
        ls[1].unlock();
    }

    void e7() {
        mk().lock();
        work();
        new ReentrantLock().unlock();
    }

    void e8() {
        mk().lock();
        n++;
        mk().unlock();
    }

    void e9() {
        arr[0].lock();
        work();
        arr[1].unlock();
    }

    void f1(Lock p) {
        Lock x = p;
        x.lock();
        work();
        p.unlock();
    }

    void f2(Object o) {
        Lock x = (Lock) o;
        x.lock();
        work();
        ((Lock) o).unlock();
    }

    void f3() {
        Lock x = mk();
        x.lock();
        work();
        lk.unlock();
    }

    Lock mk() {
        return lk;
    }

    Lock get(int i) {
        return lk;
    }

    static Lock smk() {
        return new ReentrantLock();
    }

    void work() {
        n--;
    }
}
