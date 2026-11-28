package p;

import java.util.concurrent.locks.*;

public class Made {
    int n;

    void take(Holder h) {
        h.foo.lock();
        work();
        h.foo.unlock();
    }

    void work() {
        n--;
    }

    Object make() {
        return new ReentrantLock();
    }
}
