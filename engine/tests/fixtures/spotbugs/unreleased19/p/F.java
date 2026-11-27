package p;

import java.util.concurrent.locks.*;

public class F {
    private final Lock lk = new ReentrantLock();
    private int n;

    void a() throws Throwable {
        lk.lock();
        try {
            try {
                work();
            } finally {
                work();
            }
        } catch (Throwable t) {
            lk.unlock();
            throw t;
        }
        lk.unlock();
    }

    void work() {
        n--;
    }
}
