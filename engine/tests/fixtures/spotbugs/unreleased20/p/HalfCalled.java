package p;

import java.util.concurrent.locks.*;

public class HalfCalled {
    int n;

    void take(Holder h) {
        h.foo.lock();
        work();
        h.foo.unlock();
    }

    void work() {
        n--;
    }

    Object half(Holder h) {
        return h.rrw.readLock();
    }
}
