package p;

import java.util.concurrent.locks.*;

public class Parked {
    int n;

    void take(Holder h) {
        h.foo.lock();
        work();
        h.foo.unlock();
    }

    void work() {
        n--;
    }

    void park() {
        LockSupport.parkNanos(1);
    }
}
