package p;

import java.util.concurrent.locks.*;

public class NoCall {
    int n;

    void take(Holder h) {
        h.foo.lock();
        work();
        h.foo.unlock();
    }

    void work() {
        n--;
    }

    Object kind(Object o) {
        return o instanceof Lock ? ReentrantLock.class : (ReadWriteLock) o;
    }
}
