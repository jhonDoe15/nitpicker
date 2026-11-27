package p;

import java.util.concurrent.locks.*;

public class K {
    private final Lock lk = new ReentrantLock();
    private static K snf = new K();
    private static final K SFC = make();
    private static final K SFN = new K();
    private K peer;
    private final K fpeer = null;
    private int n;
    private int x;

    static K make() {
        return new K();
    }

    void k1() {
        lk.lock();
        x = peer.n;
        lk.unlock();
    }

    void k2() {
        int a = peer.n;
        lk.lock();
        x = peer.n;
        lk.unlock();
    }

    void k3() {
        int a = peer.n;
        lk.lock();
        n++;
        x = peer.n;
        lk.unlock();
    }

    void k4() {
        lk.lock();
        x = snf.n;
        lk.unlock();
    }

    void k5() {
        lk.lock();
        x = SFC.n;
        lk.unlock();
    }

    void k5b() {
        lk.lock();
        x = SFN.n;
        lk.unlock();
    }

    void k6(K p) {
        lk.lock();
        x = p.n;
        lk.unlock();
    }

    void k7() {
        K h = new K();
        lk.lock();
        x = h.n;
        lk.unlock();
    }

    void k8() {
        if (peer != null) {
            lk.lock();
            x = peer.n;
            lk.unlock();
        }
    }

    void k9(K p) {
        int a = p.n;
        lk.lock();
        x = p.n;
        lk.unlock();
    }

    void m1() {
        lk.lock();
        x = fpeer.n;
        lk.unlock();
    }

    void m2(K p) {
        if (p == null) {
            return;
        }
        lk.lock();
        x = p.n;
        lk.unlock();
    }
}
