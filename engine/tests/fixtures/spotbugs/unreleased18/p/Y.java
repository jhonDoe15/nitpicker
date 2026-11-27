package p;

import java.util.concurrent.locks.*;

public class Y {
    private final Lock lk = new ReentrantLock();
    private Y peer;
    private final Y fin = new Y();
    private int n;

    void a(boolean b) {
        peer.lk.lock();
        while (b) {
            work();
        }
        peer.lk.unlock();
    }

    void c(boolean b) {
        peer.lk.lock();
        if (b) {
            work();
        }
        peer.lk.unlock();
    }

    void d(Y s, boolean b) {
        s.lk.lock();
        while (b) {
            work();
        }
        s.lk.unlock();
    }

    void e(Y s, boolean b) {
        s.lk.lock();
        while (b) {
            n++;
        }
        s.lk.unlock();
    }

    void f(boolean b) {
        fin.lk.lock();
        while (b) {
            work();
        }
        fin.lk.unlock();
    }

    void g(Y s, int k) {
        s.lk.lock();
        for (int i = 0; i < k; i++) {
            n++;
        }
        s.lk.unlock();
    }

    void work() {
        n--;
    }
}
