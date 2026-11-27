package p;

import java.util.concurrent.locks.*;

public class After {
    int n;
    final Lock f = new ReentrantLock();
    final Lock g = new ReentrantLock();

    void t1(Lock a, Lock b) {
        a.lock();
        work();
        a.unlock();
        b.lock();
    }

    void t2(Lock a, Lock b) {
        b.lock();
        a.lock();
        work();
        a.unlock();
    }

    void t3() {
        f.lock();
        g.unlock();
    }

    void t4(boolean c) {
        f.lock();
        if (c) {
            g.unlock();
        }
    }

    void t5(boolean c) {
        if (c) {
            g.unlock();
            return;
        }
        f.lock();
    }

    void t6() {
        g.unlock();
        f.lock();
    }

    void work() {
        n--;
    }
}
