package p;

import java.util.concurrent.locks.*;

public class W {
    private final Lock lk = new ReentrantLock();
    private int n;

    void a() {
        lk.lock();
        lk.unlock();
        lk.unlock();
    }

    void b(boolean x) {
        if (x) {
            lk.lock();
        }
        lk.unlock();
    }

    void c() {
        Lock l = new ReentrantLock();
        l.unlock();
        l.lock();
        n--;
        l.unlock();
    }
}
