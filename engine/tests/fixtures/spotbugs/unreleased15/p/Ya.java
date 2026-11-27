package p;

import java.util.concurrent.locks.*;

public class Ya {
    final Lock lk = new ReentrantLock();
    static int n;

    static void quiet() {
        n++;
    }

    void a() {
        lk.lock();
        Zb.quiet();
        lk.unlock();
    }

    void b() {
        lk.lock();
        quiet();
        lk.unlock();
    }
}
