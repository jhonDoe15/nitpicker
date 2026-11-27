package p;

import java.util.concurrent.locks.*;

public class Q {
    private final O peer = new O();
    private final Q self = this;
    private final Lock mine = new ReentrantLock();
    private int n;

    void a(O o) {
        o.lk.lock();
        work();
        o.lk.unlock();
    }

    void b() {
        O.ST.lock();
        work();
        O.ST.unlock();
    }

    void c() {
        peer.lk.lock();
        work();
        peer.lk.unlock();
    }

    void d() {
        self.mine.lock();
        work();
        self.mine.unlock();
    }

    void e() {
        Lock l = peer.lk;
        l.lock();
        work();
        l.unlock();
    }

    void work() {
        n--;
    }
}
